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

function parseMultipart(req) {
  const form = formidable({
    maxFileSize: MAX_RESUME_BYTES,
    maxTotalFileSize: MAX_RESUME_BYTES,
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

let sheetsClientPromise = null;
let sheetIdPromise = null;

function getSheetsClient() {
  if (!sheetsClientPromise) {
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    if (!rawKey) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
    const credentials = JSON.parse(rawKey);
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

// Sniffs the file's real content instead of trusting its extension or
// declared content-type, both of which are trivial to spoof.
async function detectResumeMimeType(filepath, originalFilename) {
  const { fileTypeFromFile } = await import("file-type");
  const detected = await fileTypeFromFile(filepath);
  const ext = path.extname(originalFilename || "").toLowerCase();

  if (detected && detected.mime === "application/pdf") {
    return "application/pdf";
  }
  if (
    detected &&
    detected.mime ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return detected.mime;
  }
  if (detected && detected.ext === "cfb" && ext === ".doc") {
    // Legacy binary .doc only sniffs as a generic compound-file container;
    // pair it with the declared extension to accept it.
    return "application/msword";
  }
  return null;
}

async function uploadResumeToDrive(applicantName, file) {
  const mimeType = await detectResumeMimeType(file.filepath, file.originalFilename);
  if (!mimeType) {
    return { link: "Invalid file type submitted", uploaded: false };
  }

  const ext = path.extname(file.originalFilename || "") || "";
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

  return res.status(200).json({ ok: true });
};
