const { formidable } = require("formidable");
const { google } = require("googleapis");

const SHEET_NAME = "Estimates";

const STATUS_VALUES = ["New", "Reviewed", "Quoted", "Won", "Lost"];

const TYPE_LABELS = {
  hauling: "Hauling & Trucking",
  excavation: "Excavation & Dirtworks",
};

const MATERIAL_LABELS = {
  "3-4-chip": '3/4" Chip',
  "3-4-road-mix": '3/4" Road Mix',
  "drain-rock": "Drain Rock",
  "cobble-rock": "Cobble Rock",
  "pit-run": "Pit Run",
  "fill-dirt": "Fill Dirt",
  "screened-top-soil": "Screened Top Soil",
};

const UNIT_LABELS = {
  loads: "Truck Loads",
  yards: "Cubic Yards",
  tons: "Tons",
};

const PROJECT_TYPE_LABELS = {
  "new-residential": "New Residential",
  remodel: "Remodel",
  demolition: "Demolition",
  "new-commercial": "New Commercial",
  "existing-commercial": "Existing Commercial",
};

const SERVICE_LABELS = {
  excavation: "Excavation",
  "site-development": "Site Development",
  "septic-tank": "Septic Tank",
  grading: "Grading",
  "site-cleanup": "Site Cleanup",
  other: "Other",
};

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
  const form = formidable({ multiples: false });
  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields) => {
      if (err) reject(err);
      else resolve({ fields });
    });
  });
}

// ---- Geocoding + service-area math ----
// Straight-line (haversine) distance from a single geocode per submission,
// not driving distance via the Routes API — the owner confirmed straight-line
// is acceptable, so there's no per-request Routes call to pay for or wait on.

const EARTH_RADIUS_MILES = 3958.8;

// v4 REST API (GA) — not the legacy maps.googleapis.com/maps/api/geocode/json
// v3 surface. Field mask is required to get the location back; a not-found
// address comes back as an empty `results` array with a 200, not an error.
async function geocodeAddress(address) {
  const url =
    "https://geocode.googleapis.com/v4/geocode/address/" +
    encodeURIComponent(address) +
    "?key=" +
    process.env.GOOGLE_MAPS_API_KEY;
  const res = await fetch(url, {
    headers: { "X-Goog-FieldMask": "results.location" },
  });
  if (!res.ok) throw new Error(`Geocoding request failed with status ${res.status}`);
  const data = await res.json();
  const first = data.results && data.results[0];
  if (!first || !first.location) return null;
  return { lat: first.location.latitude, lng: first.location.longitude };
}

function haversineMiles(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h));
}

// PLACEHOLDER pricing — the owner will supply the real rate formula later.
// Kept deliberately simple and obviously provisional; the frontend labels
// this result as a preliminary estimate.
const PLACEHOLDER_RATE_PER_UNIT = { loads: 150, yards: 45, tons: 35 };

function calculatePlaceholderEstimate(rawUnit, amount) {
  const rate = PLACEHOLDER_RATE_PER_UNIT[rawUnit] || 0;
  return { total: rate * amount, placeholder: true };
}

// COMPANY_ADDRESS may be a "lat,lng" pair instead of a street address — HQ
// never moves, so a fixed pair skips the geocode call entirely.
const COORDS_PATTERN = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;

function parseCoords(value) {
  const match = COORDS_PATTERN.exec(value);
  return match ? { lat: parseFloat(match[1]), lng: parseFloat(match[2]) } : null;
}

// Resolved once per warm serverless instance ("at startup") rather than once
// per submission — the company address never changes at runtime.
let companyCoordsPromise = null;

function getCompanyCoords() {
  if (!companyCoordsPromise) {
    const address = process.env.COMPANY_ADDRESS;
    if (!address) {
      companyCoordsPromise = Promise.reject(new Error("COMPANY_ADDRESS is not set"));
    } else {
      const directCoords = parseCoords(address);
      companyCoordsPromise = directCoords
        ? Promise.resolve(directCoords)
        : geocodeAddress(address).then((coords) => {
            if (!coords) throw new Error("Could not geocode COMPANY_ADDRESS");
            return coords;
          });
    }
  }
  return companyCoordsPromise;
}

// ---- Sheets ----

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

async function appendEstimateRow(sheets, row) {
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let fields;
  try {
    ({ fields } = await parseMultipart(req));
  } catch (err) {
    console.error("Failed to parse estimate submission:", err);
    return res.status(400).json({ ok: false, error: "Could not read submission" });
  }

  const rawType = firstValue(fields.type);
  const type = rawType === "hauling" || rawType === "excavation" ? rawType : null;

  const name = cleanText(firstValue(fields.name), 120);
  const phone = cleanText(firstValue(fields.phone), 40);
  const email = cleanText(firstValue(fields.email), 200);
  const address = cleanText(firstValue(fields.address), 240);
  const message = cleanText(firstValue(fields.message), 2000);

  const material = cleanEnum(firstValue(fields.material), MATERIAL_LABELS);
  const rawUnit = firstValue(fields.unit);
  const unit = cleanEnum(rawUnit, UNIT_LABELS);
  const projectType = cleanEnum(firstValue(fields.projectType), PROJECT_TYPE_LABELS);

  const rawService = firstValue(fields.service);
  const service = cleanEnum(rawService, SERVICE_LABELS);
  const serviceOther = cleanText(firstValue(fields.serviceOther), 120);

  const rawAmount = String(firstValue(fields.amount) || "").trim();
  const amount = /^[0-9]+$/.test(rawAmount) ? parseInt(rawAmount, 10) : null;

  const errors = [];
  if (!type) errors.push("type");
  if (!name) errors.push("name");
  if (!phone) errors.push("phone");
  if (!email || !isValidEmail(email)) errors.push("email");
  if (!address) errors.push("address");

  if (type === "hauling") {
    if (!material) errors.push("material");
    if (amount === null || amount < 1) errors.push("amount");
    if (!unit) errors.push("unit");
  } else if (type === "excavation") {
    if (!projectType) errors.push("projectType");
    if (!service) errors.push("service");
    if (rawService === "other" && !serviceOther) errors.push("serviceOther");
  }

  if (errors.length) {
    return res.status(400).json({ ok: false, error: "Invalid or missing fields", fields: errors });
  }

  const serviceValue =
    rawService === "other" && serviceOther ? `Other: ${serviceOther}` : service || "";

  const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/Boise" });

  // Excavation always goes to the owner for manual review/quote regardless of
  // distance (matches the page's existing copy) — the geocode here is only to
  // fill in the Distance column and confirm the address is real; it never
  // gates eligibility the way it does for hauling.
  if (type === "excavation") {
    let companyCoords, siteCoords;
    try {
      companyCoords = await getCompanyCoords();
      siteCoords = await geocodeAddress(address);
    } catch (err) {
      console.error("Failed to geocode for estimate submission:", err);
      return res.status(500).json({ ok: false, error: "Could not submit request, please try again" });
    }

    if (!siteCoords) {
      return res.status(400).json({ ok: false, error: "Could not verify that address", fields: ["address"] });
    }

    const excavDistance = haversineMiles(companyCoords, siteCoords).toFixed(1);

    const row = [
      "New", // Status
      timestamp,
      TYPE_LABELS.excavation,
      name,
      phone,
      email,
      "", // Material (hauling only)
      "", // Amount (hauling only)
      "", // Unit (hauling only)
      projectType || "",
      serviceValue,
      address,
      excavDistance,
      message,
      "N/A", // Quote - owner fills in after review
    ];

    try {
      const sheets = await getSheetsClient();
      await appendEstimateRow(sheets, row);
    } catch (err) {
      console.error("Failed to write estimate to sheet:", err);
      return res.status(500).json({ ok: false, error: "Could not submit request" });
    }

    return res.status(200).json({ ok: true, submitted: true });
  }

  // type === "hauling": in-area jobs of 4 loads or fewer get an instant
  // placeholder price and are never written to the sheet at all. Everything
  // else (out of area, or more than 4 loads) only gets logged for the
  // owner's review once the customer explicitly confirms via `confirm=1`.
  let companyCoords, siteCoords;
  try {
    companyCoords = await getCompanyCoords();
    siteCoords = await geocodeAddress(address);
  } catch (err) {
    console.error("Failed to geocode for estimate submission:", err);
    return res.status(500).json({ ok: false, error: "Could not submit request, please try again" });
  }

  if (!siteCoords) {
    return res.status(400).json({ ok: false, error: "Could not verify that address", fields: ["address"] });
  }

  const distanceMiles = haversineMiles(companyCoords, siteCoords);
  const radius = Number(process.env.SERVICE_RADIUS_MILES);
  const inServiceArea = Number.isFinite(radius) && distanceMiles <= radius;
  const loadsOk = rawUnit === "loads" && amount <= 4;

  if (inServiceArea && loadsOk) {
    const estimate = calculatePlaceholderEstimate(rawUnit, amount);
    return res.status(200).json({ ok: true, instant: true, estimate });
  }

  const confirmed = firstValue(fields.confirm) === "1";
  if (!confirmed) {
    return res.status(200).json({
      ok: true,
      instant: false,
      needsReview: true,
      outOfArea: !inServiceArea,
      tooManyLoads: !loadsOk,
    });
  }

  const row = [
    "New", // Status
    timestamp,
    TYPE_LABELS.hauling,
    name,
    phone,
    email,
    material || "",
    String(amount),
    unit || "",
    "", // Project Type (excavation only)
    "", // Service (excavation only)
    address,
    distanceMiles.toFixed(1),
    message,
    "N/A", // Quote - owner fills in after review
  ];

  try {
    const sheets = await getSheetsClient();
    await appendEstimateRow(sheets, row);
  } catch (err) {
    console.error("Failed to write estimate to sheet:", err);
    return res.status(500).json({ ok: false, error: "Could not submit request" });
  }

  return res.status(200).json({ ok: true, submitted: true });
};
