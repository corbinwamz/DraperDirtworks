// Minimal stand-ins for a Vercel request/response so the API handlers can be
// driven in-process. No framework, no network.

const { Readable } = require("stream");

// Builds a real multipart/form-data body. Values are strings, or
// { filename, contentType, content } for a file part.
function multipart(fields) {
  const boundary = "----test" + Math.random().toString(16).slice(2);
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    if (value && typeof value === "object" && value.filename !== undefined) {
      parts.push(
        Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${name}"; filename="${value.filename}"\r\n` +
            `Content-Type: ${value.contentType}\r\n\r\n`
        )
      );
      parts.push(value.content);
      parts.push(Buffer.from("\r\n"));
    } else {
      parts.push(
        Buffer.from(
          `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
        )
      );
    }
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(parts);
  return { body, contentType: `multipart/form-data; boundary=${boundary}` };
}

function mockRequest(fields, method = "POST") {
  const { body, contentType } = multipart(fields);
  const req = Readable.from([body]);
  req.method = method;
  req.headers = {
    "content-type": contentType,
    "content-length": String(body.length),
  };
  return req;
}

function mockResponse() {
  return {
    statusCode: null,
    body: null,
    headers: {},
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    },
  };
}

// A submission that passes every validation rule, so individual tests can
// change one field at a time and be sure that field is what failed.
function validApplication(overrides = {}) {
  return {
    name: "Dale Turner",
    phone: "208-555-0142",
    email: "dale@example.com",
    position: "operator",
    experience: "3-5",
    cdl: "yes",
    flexible: "yes",
    strength: "Fifteen years running an excavator on tight residential lots.",
    endorsements: "",
    equipment: "Excavator, skid steer",
    message: "",
    website: "",
    elapsed: "45000",
    ...overrides,
  };
}

function validHauling(overrides = {}) {
  return {
    type: "hauling",
    name: "Dale Turner",
    phone: "208-555-0142",
    email: "dale@example.com",
    address: "123 Main St, Boise, ID",
    material: "pit-run",
    amount: "3",
    unit: "loads",
    message: "",
    website: "",
    elapsed: "45000",
    ...overrides,
  };
}

module.exports = { multipart, mockRequest, mockResponse, validApplication, validHauling };
