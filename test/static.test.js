// Guards on the static files. These catch regressions that unit tests can't
// see: a form losing its spam trap, a length cap drifting away from the
// server's, or an innerHTML sink appearing where XSS would become possible.

const fs = require("fs");
const path = require("path");
const test = require("node:test");
const assert = require("node:assert/strict");

const ROOT = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

const FORMS = [
  { file: "careers.html", id: "application-form", honeypotId: "app-website" },
  { file: "estimate.html", id: "hauling-form", honeypotId: "haul-website" },
  { file: "estimate.html", id: "excavation-form", honeypotId: "excav-website" },
];

test("every form carries a honeypot and a timing field", () => {
  for (const form of FORMS) {
    const html = read(form.file);
    assert.ok(
      html.includes(`id="${form.honeypotId}" name="website"`),
      `${form.file}: ${form.id} is missing its honeypot input`
    );
  }

  // One elapsed field per form.
  const careers = read("careers.html").match(/name="elapsed"/g) || [];
  const estimateHtml = read("estimate.html").match(/name="elapsed"/g) || [];
  assert.equal(careers.length, 1, "careers.html needs exactly one elapsed field");
  assert.equal(estimateHtml.length, 2, "estimate.html needs one elapsed field per form");
});

test("honeypot fields are hidden from real users but not type=hidden", () => {
  for (const form of FORMS) {
    const html = read(form.file);
    const idx = html.indexOf(`id="${form.honeypotId}"`);
    assert.notEqual(idx, -1);
    const tag = html.slice(idx - 200, idx + 200);

    // type="hidden" would defeat the trap: bots skip those.
    assert.ok(!/type="hidden"[^>]*name="website"/.test(tag), `${form.honeypotId} must not be type=hidden`);
    assert.ok(tag.includes('tabindex="-1"'), `${form.honeypotId} must be out of the tab order`);
    assert.ok(tag.includes('autocomplete="off"'), `${form.honeypotId} must not autofill`);
  }

  // And the wrapper must actually be positioned off-screen.
  const css = read("css/styles.css");
  assert.match(css, /\.form-hp\s*\{[^}]*position:\s*absolute/);
  assert.match(css, /\.form-hp\s*\{[^}]*left:\s*-\d{4,}px/);

  for (const form of FORMS) {
    const html = read(form.file);
    const idx = html.indexOf(`id="${form.honeypotId}"`);
    const before = html.slice(Math.max(0, idx - 300), idx);
    assert.ok(before.includes('class="form-hp"'), `${form.honeypotId} must sit inside .form-hp`);
    assert.ok(before.includes('aria-hidden="true"'), `${form.honeypotId} must be aria-hidden`);
  }
});

test("browser length caps match the server's cleanText caps", () => {
  // Server caps, from api/apply.js and api/estimate.js.
  const expected = [
    ["careers.html", "app-equipment", 2000],
    ["careers.html", "app-strength", 2000],
    ["careers.html", "app-message", 2000],
    ["estimate.html", "haul-message", 2000],
    ["estimate.html", "excav-message", 2000],
    ["estimate.html", "excav-service-other", 120],
  ];

  for (const [file, id, cap] of expected) {
    const html = read(file);
    const idx = html.indexOf(`id="${id}"`);
    assert.notEqual(idx, -1, `${file}: #${id} not found`);
    const tag = html.slice(idx, html.indexOf(">", idx) + 1);
    assert.ok(
      tag.includes(`maxlength="${cap}"`),
      `${file}: #${id} should cap at ${cap} to match the server, got: ${tag.trim()}`
    );
  }
});

test("the amount input is bounded to match server validation", () => {
  const html = read("estimate.html");
  const idx = html.indexOf('id="haul-amount"');
  const tag = html.slice(idx, html.indexOf(">", idx) + 1);
  assert.ok(tag.includes('min="1"'), "amount needs a minimum");
  assert.ok(tag.includes('max="1000"'), "amount needs a maximum matching the server bound");
});

test("no HTML sinks in the frontend script", () => {
  const js = read("js/main.js");
  // Everything user-controlled is written with textContent. If any of these
  // appear, escaping has to be revisited before the change ships.
  for (const sink of ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write"]) {
    assert.ok(!js.includes(sink), `js/main.js must not use ${sink}`);
  }
});

test("main.js stamps the elapsed field before handlers run", () => {
  const js = read("js/main.js");
  assert.match(js, /addEventListener\(\s*["']submit["']/, "needs a submit listener");
  assert.match(js, /input\[name=elapsed\]/, "must target the elapsed field");
  // The `true` argument is the capture phase, which is what guarantees this
  // runs before each form builds its FormData.
  assert.match(
    js,
    /input\[name=elapsed\][\s\S]{0,200}?\btrue\b/,
    "the listener must be registered in the capture phase"
  );
});

test("security headers are declared for every path", () => {
  const config = JSON.parse(read("vercel.json"));
  const rule = config.headers.find((h) => h.source === "/(.*)");
  assert.ok(rule, "vercel.json needs a catch-all header rule");

  const byKey = Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));

  assert.match(byKey["Strict-Transport-Security"], /max-age=\d+/);
  const maxAge = Number(byKey["Strict-Transport-Security"].match(/max-age=(\d+)/)[1]);
  assert.ok(maxAge >= 31536000, "HSTS max-age should be at least a year");

  assert.equal(byKey["X-Content-Type-Options"], "nosniff");
  assert.equal(byKey["X-Frame-Options"], "DENY");
  assert.match(byKey["Referrer-Policy"], /strict-origin/);
});

test("no secrets are committed", () => {
  const example = read(".env.example");
  for (const line of example.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    assert.match(line, /^[A-Z_]+=$/, `.env.example must hold empty keys only, got: ${line}`);
  }

  const gitignore = read(".gitignore");
  assert.ok(gitignore.includes(".env"), ".env must be gitignored");
});

test(".env.example documents every variable the code reads", () => {
  const declared = new Set(
    read(".env.example")
      .split("\n")
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => l.split("=")[0].trim())
  );

  const source = read("api/apply.js") + read("api/estimate.js");
  const used = new Set([...source.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]));

  for (const name of used) {
    assert.ok(declared.has(name), `${name} is read by the code but missing from .env.example`);
  }
});
