// One-time setup: applies the Status column dropdown + color-by-value
// conditional formatting to the whole "Applications" sheet, so that:
//  - any row (existing or manually added later) gets the dropdown, and
//  - manually changing a status in the sheet UI recolors the cell automatically.
//
// api/apply.js separately sets the dropdown on each row it appends
// (appendCells doesn't inherit column-wide rules onto new rows), so this
// script only needs to be run once, not after every deploy. The conditional
// formatting rules here also cover "New" automatically since they react to
// whatever text is in the cell.
//
// Usage (Node 20.6+, uses env vars from .env directly):
//   node --env-file=.env scripts/setup-status-formatting.js

const { google } = require("googleapis");

const SHEET_NAME = "Applications";
const STATUS_VALUES = ["New", "Reviewed", "Hired", "Rejected"];
const STATUS_COLORS = {
  New: { red: 0.812, green: 0.886, blue: 0.953 },
  Reviewed: { red: 1, green: 0.949, blue: 0.8 },
  Hired: { red: 0.851, green: 0.918, blue: 0.827 },
  Rejected: { red: 0.957, green: 0.8, blue: 0.8 },
};
// Generous row bound so new rows inserted below existing data stay covered
// without needing this script re-run; raise it if the sheet outgrows it.
const LAST_ROW = 5000;

async function main() {
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY is not set");
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID is not set");

  const credentials = JSON.parse(rawKey);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const sheets = google.sheets({ version: "v4", auth: await auth.getClient() });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties(sheetId,title)",
  });
  const sheet = meta.data.sheets.find((s) => s.properties.title === SHEET_NAME);
  if (!sheet) throw new Error(`Sheet "${SHEET_NAME}" not found`);
  const sheetId = sheet.properties.sheetId;

  const range = {
    sheetId,
    startRowIndex: 1, // skip header row
    endRowIndex: LAST_ROW,
    startColumnIndex: 0,
    endColumnIndex: 1,
  };

  const requests = [
    {
      setDataValidation: {
        range,
        rule: {
          condition: {
            type: "ONE_OF_LIST",
            values: STATUS_VALUES.map((v) => ({ userEnteredValue: v })),
          },
          strict: true,
          showCustomUi: true,
        },
      },
    },
    ...STATUS_VALUES.map((value) => ({
      addConditionalFormatRule: {
        rule: {
          ranges: [range],
          booleanRule: {
            condition: { type: "TEXT_EQ", values: [{ userEnteredValue: value }] },
            format: { backgroundColor: STATUS_COLORS[value] },
          },
        },
        index: 0,
      },
    })),
  ];

  await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  console.log(`Applied Status dropdown + color rules to ${SHEET_NAME}!A2:A${LAST_ROW}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
