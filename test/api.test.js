// Redirect uploads into a dedicated directory BEFORE anything requires
// formidable — its default uploadDir is captured from os.tmpdir() at module
// load. This makes the temp-file cleanup assertions deterministic instead of
// fishing through the real system temp directory.
const fs = require("fs");
const os = require("os");
const path = require("path");

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ddw-test-"));
process.env.TMPDIR = UPLOAD_DIR;
process.env.TMP = UPLOAD_DIR;
process.env.TEMP = UPLOAD_DIR;

const test = require("node:test");
const assert = require("node:assert/strict");

const applyHandler = require("../api/apply.js");
const estimateHandler = require("../api/estimate.js");
const apply = applyHandler.__testing;
const estimate = estimateHandler.__testing;

const {
  mockRequest,
  mockResponse,
  validApplication,
  validHauling,
} = require("./helpers.js");

function uploadDirFiles() {
  return fs.readdirSync(UPLOAD_DIR);
}

async function post(handler, fields, method = "POST") {
  const res = mockResponse();
  await handler(mockRequest(fields, method), res);
  return res;
}

test.after(() => fs.rmSync(UPLOAD_DIR, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// Spreadsheet formula injection — cleanText
// ---------------------------------------------------------------------------

test("cleanText neutralizes spreadsheet formula injection", () => {
  for (const { cleanText } of [apply, estimate]) {
    assert.equal(cleanText("=1+1", 100), "'=1+1");
    assert.equal(cleanText("+1234", 100), "'+1234");
    assert.equal(cleanText("-1+1", 100), "'-1+1");
    assert.equal(cleanText("@SUM(A1)", 100), "'@SUM(A1)");
    assert.equal(cleanText('=HYPERLINK("http://evil","click")', 100)[0], "'");

    // Leading whitespace must not smuggle a formula past the check: trim
    // happens before the test.
    assert.equal(cleanText("   =1+1", 100), "'=1+1");
    assert.equal(cleanText("\t=cmd|'/c calc'!A1", 100)[0], "'");
    assert.equal(cleanText("\r\n=1+1", 100), "'=1+1");

    // Ordinary text is untouched.
    assert.equal(cleanText("Smith & Sons", 100), "Smith & Sons");
    assert.equal(cleanText('20" pipe', 100), '20" pipe');
    assert.equal(cleanText("  padded  ", 100), "padded");
  }
});

test("cleanText enforces the length cap and handles non-strings", () => {
  const { cleanText } = apply;
  assert.equal(cleanText("x".repeat(5000), 2000).length, 2000);
  assert.equal(cleanText(undefined, 100), "");
  assert.equal(cleanText(null, 100), "");
  assert.equal(cleanText(12345, 100), "");
  assert.equal(cleanText({}, 100), "");
});

// ---------------------------------------------------------------------------
// Dropdown allowlisting — cleanEnum
// ---------------------------------------------------------------------------

test("cleanEnum maps known values and rejects everything else", () => {
  const { cleanEnum, POSITION_LABELS } = apply;
  assert.equal(cleanEnum("operator", POSITION_LABELS), "Operator");
  assert.equal(cleanEnum("truck-driver", POSITION_LABELS), "Truck Driver");
  assert.equal(cleanEnum("ceo", POSITION_LABELS), null);
  assert.equal(cleanEnum("", POSITION_LABELS), null);
  assert.equal(cleanEnum(undefined, POSITION_LABELS), null);
});

test("cleanEnum is not fooled by inherited Object properties", () => {
  const { cleanEnum, POSITION_LABELS } = apply;
  // The hasOwnProperty.call guard is what stops these resolving to functions
  // or to Object.prototype itself.
  for (const key of ["__proto__", "constructor", "toString", "hasOwnProperty", "valueOf"]) {
    assert.equal(cleanEnum(key, POSITION_LABELS), null, `${key} must not resolve`);
  }
});

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

test("isValidEmail accepts real addresses and rejects header-injection attempts", () => {
  const { isValidEmail } = apply;
  assert.ok(isValidEmail("dale@example.com"));
  assert.ok(isValidEmail("dale.turner+jobs@sub.example.co.uk"));

  assert.ok(!isValidEmail("dale@example"));
  assert.ok(!isValidEmail("@example.com"));
  assert.ok(!isValidEmail("dale example@x.com"));
  // Newlines are what a header-injection payload needs; the \s class blocks them.
  assert.ok(!isValidEmail("dale@example.com\nBcc: victim@x.com"));
  assert.ok(!isValidEmail("dale@example.com\r\nBcc: victim@x.com"));
});

// ---------------------------------------------------------------------------
// Bot filters — honeypot + fill timing
// ---------------------------------------------------------------------------

test("looksAutomated flags a filled honeypot", () => {
  for (const { looksAutomated } of [apply, estimate]) {
    assert.equal(looksAutomated({ website: "http://spam.example", elapsed: "40000" }), true);
    assert.equal(looksAutomated({ website: "x" }), true);
  }
});

test("looksAutomated flags submissions faster than a human", () => {
  for (const { looksAutomated, MIN_FILL_MS } of [apply, estimate]) {
    assert.equal(looksAutomated({ website: "", elapsed: "0" }), true);
    assert.equal(looksAutomated({ website: "", elapsed: "400" }), true);
    assert.equal(looksAutomated({ website: "", elapsed: String(MIN_FILL_MS - 1) }), true);
    // The boundary itself is allowed through.
    assert.equal(looksAutomated({ website: "", elapsed: String(MIN_FILL_MS) }), false);
  }
});

test("looksAutomated fails open on missing or unusable values", () => {
  for (const { looksAutomated } of [apply, estimate]) {
    // A real user whose JS didn't run must never be blocked.
    assert.equal(looksAutomated({}), false);
    assert.equal(looksAutomated({ website: "", elapsed: "" }), false);
    assert.equal(looksAutomated({ website: "", elapsed: "abc" }), false);
    assert.equal(looksAutomated({ website: "", elapsed: "-5000" }), false);
    assert.equal(looksAutomated({ website: "   ", elapsed: "40000" }), false);
    // formidable hands fields back as arrays.
    assert.equal(looksAutomated({ website: [""], elapsed: ["40000"] }), false);
    assert.equal(looksAutomated({ website: ["spam"], elapsed: ["40000"] }), true);
  }
});

// ---------------------------------------------------------------------------
// Temp file cleanup
// ---------------------------------------------------------------------------

test("cleanupTempFiles removes files in both formidable shapes", async () => {
  const { cleanupTempFiles } = apply;
  const make = (name) => {
    const p = path.join(UPLOAD_DIR, name);
    fs.writeFileSync(p, "x");
    return p;
  };

  const a = make("a.pdf");
  const b = make("b.docx");
  await cleanupTempFiles({ resume: [{ filepath: a }], other: [{ filepath: b }] });
  assert.ok(!fs.existsSync(a) && !fs.existsSync(b), "array-shaped files removed");

  const c = make("c.pdf");
  await cleanupTempFiles({ resume: { filepath: c } });
  assert.ok(!fs.existsSync(c), "single-object file removed");
});

test("cleanupTempFiles never throws on absent or empty input", async () => {
  const { cleanupTempFiles } = apply;
  await cleanupTempFiles(undefined);
  await cleanupTempFiles({});
  await cleanupTempFiles({ resume: [] });
  await cleanupTempFiles({ resume: [{ filepath: path.join(UPLOAD_DIR, "gone.pdf") }] });
  await cleanupTempFiles({ resume: [{}] });
});

// ---------------------------------------------------------------------------
// Resume type allowlist
// ---------------------------------------------------------------------------

const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
const CFB_BYTES = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(512, 0),
]);
const EXE_BYTES = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(256, 0)]);
const EMPTY_ZIP = Buffer.concat([Buffer.from("PK\x05\x06", "binary"), Buffer.alloc(18, 0)]);
const ZIP_HEADER = Buffer.concat([Buffer.from("PK\x03\x04", "binary"), Buffer.alloc(26, 0)]);
// A zip that carries no Word part is not a .docx, however it is named.
const PLAIN_ZIP = Buffer.concat([ZIP_HEADER, Buffer.from("notes.txt"), Buffer.alloc(64, 0)]);
const DOCX_BYTES = Buffer.concat([
  ZIP_HEADER,
  Buffer.from("[Content_Types].xml"),
  Buffer.alloc(64, 0),
  Buffer.from("word/document.xml"),
  Buffer.alloc(64, 0),
]);

async function sniff(bytes, filename) {
  const p = path.join(UPLOAD_DIR, "sniff-" + Math.random().toString(16).slice(2));
  fs.writeFileSync(p, bytes);
  try {
    return await apply.detectResumeMimeType(p, filename);
  } finally {
    fs.rmSync(p, { force: true });
  }
}

test("detectResumeMimeType accepts PDF by content, not by extension", async () => {
  assert.equal(await sniff(PDF_BYTES, "resume.pdf"), "application/pdf");
  // Same bytes, misleading name: still accepted, because content decides.
  assert.equal(await sniff(PDF_BYTES, "resume.exe"), "application/pdf");
  assert.equal(await sniff(PDF_BYTES, ""), "application/pdf");
});

test("detectResumeMimeType rejects disguised executables and plain text", async () => {
  assert.equal(await sniff(EXE_BYTES, "resume.pdf"), null, "renamed .exe rejected");
  assert.equal(await sniff(Buffer.from("just some text"), "resume.pdf"), null);
  assert.equal(await sniff(Buffer.alloc(0), "resume.pdf"), null);
});

test("detectResumeMimeType accepts legacy .doc only with a matching extension", async () => {
  assert.equal(await sniff(CFB_BYTES, "resume.doc"), "application/msword");
  // The same container claiming to be something else is not accepted.
  assert.equal(await sniff(CFB_BYTES, "resume.msi"), null);
  assert.equal(await sniff(CFB_BYTES, "resume.pdf"), null);
});

test("detectResumeMimeType rejects a plain zip that is not a .docx", async () => {
  assert.equal(await sniff(EMPTY_ZIP, "resume.docx"), null);
  assert.equal(await sniff(PLAIN_ZIP, "resume.docx"), null);
});

test("detectResumeMimeType accepts a docx by its zip contents", async () => {
  const expected =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  assert.equal(await sniff(DOCX_BYTES, "resume.docx"), expected);
  // Content decides, so a misleading name changes nothing.
  assert.equal(await sniff(DOCX_BYTES, "resume.exe"), expected);
});

test("parseServiceAccountKey tolerates a quote-wrapped dashboard paste", () => {
  const { parseServiceAccountKey } = apply;
  const json = '{"type":"service_account","project_id":"dd"}';
  assert.deepEqual(parseServiceAccountKey(json), JSON.parse(json));
  assert.deepEqual(parseServiceAccountKey("'" + json + "'"), JSON.parse(json));
  assert.deepEqual(parseServiceAccountKey('"' + json + '"'), JSON.parse(json));
  assert.deepEqual(parseServiceAccountKey("  " + json + "\n"), JSON.parse(json));
});

test("parseServiceAccountKey reports missing and malformed keys distinctly", () => {
  const { parseServiceAccountKey } = apply;
  assert.throws(() => parseServiceAccountKey(undefined), /is not set/);
  assert.throws(() => parseServiceAccountKey("   "), /is not set/);
  assert.throws(() => parseServiceAccountKey("{nope"), /not valid JSON/);
  // A lone leading quote is not a matching pair, so it stays malformed.
  assert.throws(() => parseServiceAccountKey("'{\"a\":1}"), /not valid JSON/);
});

test("every accepted mime type maps to a stored extension", () => {
  const { EXTENSION_BY_MIME } = apply;
  const accepted = [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ];
  for (const mime of accepted) {
    assert.ok(EXTENSION_BY_MIME[mime], `${mime} needs an extension`);
    assert.match(EXTENSION_BY_MIME[mime], /^\.[a-z]+$/);
  }
  assert.equal(Object.keys(EXTENSION_BY_MIME).length, accepted.length);
});

// ---------------------------------------------------------------------------
// Distance and pricing math
// ---------------------------------------------------------------------------

test("haversineMiles computes known distances", () => {
  const { haversineMiles } = estimate;
  const boise = { lat: 43.615, lng: -116.2023 };
  const nampa = { lat: 43.5407, lng: -116.5635 };

  assert.equal(haversineMiles(boise, boise), 0);
  // Boise to Nampa is about 19 miles as the crow flies.
  const d = haversineMiles(boise, nampa);
  assert.ok(d > 17 && d < 21, `expected ~19 miles, got ${d}`);
  // Symmetric.
  assert.equal(haversineMiles(boise, nampa).toFixed(6), haversineMiles(nampa, boise).toFixed(6));
});

test("parseCoords accepts a lat,lng pair and rejects an address", () => {
  const { parseCoords } = estimate;
  assert.deepEqual(parseCoords("43.615,-116.2023"), { lat: 43.615, lng: -116.2023 });
  assert.deepEqual(parseCoords("  43.615 , -116.2023  "), { lat: 43.615, lng: -116.2023 });
  assert.deepEqual(parseCoords("43,-116"), { lat: 43, lng: -116 });

  assert.equal(parseCoords("123 Main St, Boise, ID"), null);
  assert.equal(parseCoords(""), null);
  assert.equal(parseCoords("43.615"), null);
});

test("placeholder pricing multiplies the per-unit rate", () => {
  const { calculatePlaceholderEstimate } = estimate;
  assert.deepEqual(calculatePlaceholderEstimate("loads", 3), { total: 450, placeholder: true });
  assert.deepEqual(calculatePlaceholderEstimate("yards", 2), { total: 90, placeholder: true });
  assert.deepEqual(calculatePlaceholderEstimate("tons", 4), { total: 140, placeholder: true });
  // An unknown unit can never invent a price.
  assert.deepEqual(calculatePlaceholderEstimate("bogus", 5), { total: 0, placeholder: true });
});

// ---------------------------------------------------------------------------
// /api/apply — end to end through the handler
// ---------------------------------------------------------------------------

test("apply rejects non-POST", async () => {
  const res = await post(applyHandler, validApplication(), "GET");
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
});

test("apply silently accepts a honeypot submission and writes nothing", async () => {
  const res = await post(applyHandler, validApplication({ website: "http://spam.example" }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true }, "bot gets an ordinary success response");
  assert.deepEqual(uploadDirFiles(), [], "no temp file left behind");
});

test("apply silently accepts a too-fast submission", async () => {
  const res = await post(applyHandler, validApplication({ elapsed: "300" }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true });
  assert.deepEqual(uploadDirFiles(), []);
});

test("apply reports every missing required field", async () => {
  const res = await post(
    applyHandler,
    validApplication({ name: "", phone: "", strength: "", position: "", cdl: "" })
  );
  assert.equal(res.statusCode, 400);
  assert.equal(res.body.ok, false);
  for (const field of ["name", "phone", "position", "cdl", "strength"]) {
    assert.ok(res.body.fields.includes(field), `expected ${field} in ${res.body.fields}`);
  }
});

test("apply rejects a malformed email", async () => {
  const res = await post(applyHandler, validApplication({ email: "not-an-email" }));
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body.fields, ["email"]);
});

test("apply rejects a value outside the dropdown allowlist", async () => {
  const res = await post(applyHandler, validApplication({ position: "ceo" }));
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.includes("position"));
});

test("apply deletes the temp upload when validation fails", async () => {
  const res = await post(
    applyHandler,
    validApplication({
      email: "not-an-email",
      resume: { filename: "resume.pdf", contentType: "application/pdf", content: PDF_BYTES },
    })
  );
  assert.equal(res.statusCode, 400);
  assert.deepEqual(uploadDirFiles(), [], "temp file removed on the error path too");
});

test("apply deletes the temp upload when the bot filter trips", async () => {
  const res = await post(
    applyHandler,
    validApplication({
      website: "spam",
      resume: { filename: "resume.pdf", contentType: "application/pdf", content: PDF_BYTES },
    })
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(uploadDirFiles(), [], "temp file removed before the early return");
});

test("apply refuses an oversized text field", async () => {
  const res = await post(applyHandler, validApplication({ message: "x".repeat(200 * 1024) }));
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Could not read submission/);
  assert.deepEqual(uploadDirFiles(), []);
});

// ---------------------------------------------------------------------------
// /api/estimate — end to end through the handler
//
// Every case below fails validation or trips the bot filter, so none of them
// reaches the geocoder. That is deliberate: the suite makes no network calls.
// ---------------------------------------------------------------------------

test("estimate rejects non-POST", async () => {
  const res = await post(estimateHandler, validHauling(), "GET");
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, "POST");
});

test("estimate silently accepts a honeypot submission without geocoding", async () => {
  const res = await post(estimateHandler, validHauling({ website: "http://spam.example" }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, submitted: true });
});

test("estimate silently accepts a too-fast submission", async () => {
  const res = await post(estimateHandler, validHauling({ elapsed: "100" }));
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, submitted: true });
});

test("estimate rejects an unknown project type", async () => {
  const res = await post(estimateHandler, validHauling({ type: "demolition-derby" }));
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.includes("type"));
});

test("estimate requires an address", async () => {
  const res = await post(estimateHandler, validHauling({ address: "" }));
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.includes("address"));
});

test("estimate enforces the amount bounds", async () => {
  for (const amount of ["0", "1001", "99999", "123456", "9".repeat(1000), "-5", "2.5", "abc", ""]) {
    const res = await post(estimateHandler, validHauling({ amount }));
    assert.equal(res.statusCode, 400, `amount=${amount.slice(0, 12)} should be rejected`);
    assert.ok(res.body.fields.includes("amount"), `amount=${amount.slice(0, 12)}`);
  }
});

test("estimate rejects a material outside the allowlist", async () => {
  const res = await post(estimateHandler, validHauling({ material: "uranium" }));
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.includes("material"));
});

test("estimate requires the excavation-specific fields", async () => {
  const res = await post(estimateHandler, {
    type: "excavation",
    name: "Dale Turner",
    phone: "208-555-0142",
    email: "dale@example.com",
    address: "123 Main St",
    projectType: "",
    service: "",
    website: "",
    elapsed: "45000",
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.includes("projectType"));
  assert.ok(res.body.fields.includes("service"));
});

test("estimate requires the free-text field when service is Other", async () => {
  const res = await post(estimateHandler, {
    type: "excavation",
    name: "Dale Turner",
    phone: "208-555-0142",
    email: "dale@example.com",
    address: "123 Main St",
    projectType: "remodel",
    service: "other",
    serviceOther: "",
    website: "",
    elapsed: "45000",
  });
  assert.equal(res.statusCode, 400);
  assert.ok(res.body.fields.includes("serviceOther"));
});

test("estimate refuses an oversized text field", async () => {
  const res = await post(estimateHandler, validHauling({ message: "x".repeat(200 * 1024) }));
  assert.equal(res.statusCode, 400);
  assert.match(res.body.error, /Could not read submission/);
});
