const fs = require("fs");
const path = require("path");
const { formidable } = require("formidable");
const { google } = require("googleapis");

const SHEET_NAME = "Applications";
const MAX_RESUME_BYTES = 4 * 1024 * 1024; // stay comfortably under Vercel's request body cap

const STATUS_VALUES = ["New", "Reviewed", "Hired", "Rejected"];

const POSITION_LABELS = {
  "truck-driver": "Truck Driver",
  operator: "Operator",
  laborer: "Laborer",
  either: "Open to Any of the Above",
};

const EXPERIENCE_LABELS = {
  none: "None / Entry-Level",
  "0-1": "Less than 1 year",
  "1-3": "1-3 years",
  "3-5": "3-5 years",
  "5-10": "5-10 years",
  "10+": "10+ years",
};

const YES_NO_LABELS = { yes: "Yes", no: "No" };

function cleanText(value, maxLen) {
  let s = typeof value === "string" ? value.trim() : "";
  if (s.length > maxLen) s = s.slice(0, maxLen);
  // Neutralize spreadsheet formula injection (a cell starting with =, +, -, or @
  // can be interpreted as a formula by Sheets/Excel).
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return s;
}

function cleanEnum(value, labels) {
  return Object.prototype.hasOwnProperty.call(labels, value) ? labels[value] : null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function firstValue(v) {
  return Array.isArray(v) ? v[0] : v;
}

// Cheap bot filters that need no shared state (so they work fine across
// serverless instances): a honeypot field real users never see, and how long
// the form was on screen. Both fail open — a missing or unparseable value is
// never treated as automated, so a real applicant is never turned away by it.
const MIN_FILL_MS = 3000;

function looksAutomated(fields) {
  const honeypot = firstValue(fields.website);
  if (typeof honeypot === "string" && honeypot.trim()) return true;

  const elapsed = parseInt(String(firstValue(fields.elapsed) || ""), 10);
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed < MIN_FILL_MS;
}

function parseMultipart(req) {
  const form = formidable({
    maxFileSize: MAX_RESUME_BYTES,
    maxTotalFileSize: MAX_RESUME_BYTES,
    // Text fields are capped separately from the resume. ~7KB covers every
    // field at its maximum length; formidable would otherwise allow 20MB.
    maxFields: 25,
    maxFieldsSize: 100 * 1024,
    multiples: false,
    allowEmptyFiles: true,
    minFileSize: 0,
  });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

// formidable streams every upload to a temp file. Vercel's /tmp is capped at
// 512MB and shared by every request a warm instance handles, so a file left
// behind is a slow leak that eventually breaks uploads for real applicants.
// Never allowed to fail the request — a cleanup problem is ours, not theirs.
async function cleanupTempFiles(files) {
  if (!files) return;

  // formidable hands back either a single file or an array per field.
  const uploads = Object.values(files).flat().filter(Boolean);

  await Promise.all(
    uploads
      .filter((file) => file.filepath)
      .map((file) =>
        fs.promises.unlink(file.filepath).catch((err) => {
          if (err.code !== "ENOENT") {
            console.error("Failed to remove temp upload:", err);
          }
        })
      )
  );
}

let sheetsClientPromise = null;
let sheetIdPromise = null;

// The key is a JSON blob pasted into a dashboard field, where it easily picks
// up wrapping quotes from a shell-style copy. Strip a matching pair rather
// than fail every submission over it.
function parseServiceAccountKey(rawKey) {
  let s = typeof rawKey === "string" ? rawKey.trim() : "";
  if (!s) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  if ((s.startsWith("'") && s.endsWith("'")) || (s.startsWith('"') && s.endsWith('"'))) {
    s = s.slice(1, -1).trim();
  }
  try {
    return JSON.parse(s);
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not valid JSON");
  }
}

function getSheetsClient() {
  if (!sheetsClientPromise) {
    const credentials = parseServiceAccountKey(process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheetsClientPromise = auth.getClient().then((authClient) =>
      google.sheets({ version: "v4", auth: authClient })
    );
  }
  return sheetsClientPromise;
}

async function getSheetId(sheets) {
  if (!sheetIdPromise) {
    sheetIdPromise = sheets.spreadsheets
      .get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        fields: "sheets.properties(sheetId,title)",
      })
      .then((res) => {
        const sheet = res.data.sheets.find((s) => s.properties.title === SHEET_NAME);
        if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found`);
        return sheet.properties.sheetId;
      });
  }
  return sheetIdPromise;
}

// Appends the row's values and sets the Status cell's dropdown validation in
// a single batchUpdate call. values.append's INSERT_ROWS doesn't inherit the
// column's dropdown onto a newly inserted row, so it's set explicitly here.
// Color-by-status is handled separately by the standing conditional format
// rules from scripts/setup-status-formatting.js, which react live to
// whatever text is in the cell (including "New" right away) with no extra
// API call needed on write.
async function appendApplicationRow(sheets, row) {
  const sheetId = await getSheetId(sheets);
  const rowData = {
    values: row.map((value, i) => {
      const cell = { userEnteredValue: { stringValue: value } };
      if (i === 0) {
        cell.dataValidation = {
          condition: {
            type: "ONE_OF_LIST",
            values: STATUS_VALUES.map((v) => ({ userEnteredValue: v })),
          },
          strict: true,
          showCustomUi: true,
        };
      }
      return cell;
    }),
  };

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: process.env.SPREADSHEET_ID,
    requestBody: {
      requests: [
        {
          appendCells: {
            sheetId,
            rows: [rowData],
            fields: "userEnteredValue,dataValidation",
          },
        },
      ],
    },
  });
}

function getDriveClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
  );
  oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
  return google.drive({ version: "v3", auth: oauth2Client });
}

// The complete set of accepted resume types. Doubles as the source of the
// stored file's extension, so the name on disk always matches the content.
const EXTENSION_BY_MIME = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/msword": ".doc",
};

const PDF_MAGIC = Buffer.from("%PDF-");
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // local file header
// OLE2 compound file, the container behind legacy .doc/.xls/.msi.
const CFB_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// Sniffs the file's real content instead of trusting its extension or
// declared content-type, both of which are trivial to spoof. Only three
// magic numbers matter here, so we read them directly rather than pull in a
// sniffing library (uploads are capped at MAX_RESUME_BYTES, so reading the
// whole file is cheap).
async function detectResumeMimeType(filepath, originalFilename) {
  let buf;
  try {
    buf = await fs.promises.readFile(filepath);
  } catch {
    return null;
  }
  const ext = path.extname(originalFilename || "").toLowerCase();

  if (buf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return "application/pdf";
  }
  if (buf.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) {
    // A .docx is a zip; what makes it a Word document is the word/ part
    // inside. Its name appears in both the local headers and the central
    // directory, so a plain zip renamed .docx is rejected here.
    return buf.includes("word/document.xml") ? DOCX_MIME : null;
  }
  if (buf.subarray(0, CFB_MAGIC.length).equals(CFB_MAGIC) && ext === ".doc") {
    // The legacy container is shared with .xls and .msi, so pair it with the
    // declared extension before accepting it.
    return "application/msword";
  }
  return null;
}

async function uploadResumeToDrive(applicantName, file) {
  const mimeType = await detectResumeMimeType(file.filepath, file.originalFilename);
  if (!mimeType) {
    return { link: "Invalid file type submitted", uploaded: false };
  }

  // Extension comes from the type we detected, never from the submitted
  // filename — otherwise a genuine PDF uploaded as "resume.exe" would be
  // stored with that extension and be dangerous to whoever downloads it.
  const ext = EXTENSION_BY_MIME[mimeType];
  const safeName =
    applicantName
      .replace(/[^a-z0-9 \-]/gi, "")
      .trim()
      .replace(/\s+/g, "_") || "applicant";
  const driveFileName = `${safeName}_${Date.now()}${ext}`;

  const drive = getDriveClient();
  const uploadRes = await drive.files.create({
    requestBody: { name: driveFileName, parents: [process.env.FOLDER_ID] },
    media: { mimeType, body: fs.createReadStream(file.filepath) },
    fields: "id, webViewLink",
  });

  const link =
    uploadRes.data.webViewLink ||
    `https://drive.google.com/file/d/${uploadRes.data.id}/view`;
  return { link, uploaded: true };
}

// Notifies the owner that an application came in, via Resend's REST API
// directly — one fetch call, no extra dependency. Plain text only: nothing
// user-supplied is interpolated into HTML, so there is no escaping to get
// wrong. Details stay minimal and link back to the sheet rather than copying
// the whole application into an inbox.
async function sendOwnerNotification({ name, phone, email, position, timestamp, resumeLink }) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL_TO;
  if (!apiKey || !to) return;

  const from = process.env.NOTIFY_EMAIL_FROM || "Draper Dirtworks <onboarding@resend.dev>";
  const sheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      // Lets the owner reply straight to the applicant without the From
      // address forging a domain we don't control.
      reply_to: email,
      subject: `New application: ${name} - ${position}`,
      text: [
        `${name} applied for ${position}.`,
        "",
        `Phone: ${phone}`,
        `Email: ${email}`,
        `Resume: ${resumeLink}`,
        `Submitted: ${timestamp}`,
        "",
        `Full details: ${sheetUrl}`,
      ].join("\n"),
    }),
  });

  if (!response.ok) {
    throw new Error(`Resend responded ${response.status}: ${await response.text()}`);
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let fields, files;
  try {
    ({ fields, files } = await parseMultipart(req));
  } catch (err) {
    console.error("Failed to parse application submission:", err);
    return res
      .status(400)
      .json({ ok: false, error: "Could not read submission (file may be too large)" });
  }

  // The work is delegated so this finally covers every exit below it — the
  // bot filter, a validation error, a failed upload, or success.
  try {
    return await processApplication(res, fields, files);
  } finally {
    await cleanupTempFiles(files);
  }
};

async function processApplication(res, fields, files) {
  // Accept and discard silently. A bot that gets a 200 has no signal that it
  // was caught, so nothing is written, uploaded, or emailed.
  if (looksAutomated(fields)) {
    return res.status(200).json({ ok: true });
  }

  const name = cleanText(firstValue(fields.name), 120);
  const phone = cleanText(firstValue(fields.phone), 40);
  const email = cleanText(firstValue(fields.email), 200);
  const position = cleanEnum(firstValue(fields.position), POSITION_LABELS);
  const experience = cleanEnum(firstValue(fields.experience), EXPERIENCE_LABELS);
  const cdl = cleanEnum(firstValue(fields.cdl), YES_NO_LABELS);
  const flexible = cleanEnum(firstValue(fields.flexible), YES_NO_LABELS);
  const strength = cleanText(firstValue(fields.strength), 2000);
  const endorsements = cleanText(firstValue(fields.endorsements), 300);
  const equipment = cleanText(firstValue(fields.equipment), 2000);
  const message = cleanText(firstValue(fields.message), 2000);

  const errors = [];
  if (!name) errors.push("name");
  if (!phone) errors.push("phone");
  if (!email || !isValidEmail(email)) errors.push("email");
  if (!position) errors.push("position");
  if (!experience) errors.push("experience");
  if (!cdl) errors.push("cdl");
  if (!flexible) errors.push("flexible");
  if (!strength) errors.push("strength");

  if (errors.length) {
    return res.status(400).json({ ok: false, error: "Invalid or missing fields", fields: errors });
  }

  const resumeFile = firstValue(files.resume);
  let resumeLink = "No Submission";

  if (resumeFile && resumeFile.size > 0) {
    try {
      const result = await uploadResumeToDrive(name, resumeFile);
      resumeLink = result.link;
    } catch (err) {
      console.error("Failed to upload resume to Drive:", err);
      resumeLink = "Upload failed - contact applicant directly";
    }
  }

  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/Boise" });

  const row = [
    "New", // Status
    timestamp,
    name,
    phone,
    email,
    position,
    experience,
    cdl,
    endorsements,
    equipment,
    flexible,
    strength,
    message,
    resumeLink,
  ];

  try {
    const sheets = await getSheetsClient();
    await appendApplicationRow(sheets, row);
  } catch (err) {
    console.error("Failed to write application to sheet:", err);
    return res.status(500).json({ ok: false, error: "Could not submit application" });
  }

  // Best-effort, and awaited rather than fire-and-forget: the function can be
  // frozen the moment we respond. The sheet is the record of truth, so a
  // failed notification must never turn a successful application into an
  // error for the applicant.
  try {
    await sendOwnerNotification({ name, phone, email, position, timestamp, resumeLink });
  } catch (err) {
    console.error("Failed to send application notification:", err);
  }

  return res.status(200).json({ ok: true });
}

// Internals exposed for the test suite only. Not part of the HTTP contract —
// nothing outside test/ should import these.
module.exports.__testing = {
  cleanText,
  cleanEnum,
  isValidEmail,
  looksAutomated,
  cleanupTempFiles,
  detectResumeMimeType,
  parseServiceAccountKey,
  EXTENSION_BY_MIME,
  POSITION_LABELS,
  MIN_FILL_MS,
};
