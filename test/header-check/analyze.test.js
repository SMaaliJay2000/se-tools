import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { analyze } from "../../server/tools/header-check/lib/analyze.js";
import { computeScore } from "../../server/tools/header-check/lib/score.js";

process.env.ALLOW_PRIVATE_TARGETS = "true"; // fixtures run on 127.0.0.1

const servers = [];
const listen = (handler) =>
  new Promise((resolve) => {
    const s = http.createServer(handler).listen(0, "127.0.0.1", () => {
      servers.push(s);
      resolve(`http://127.0.0.1:${s.address().port}`);
    });
  });

let bad, good, bypass, redirect;

before(async () => {
  // Misconfigured: reflects any origin with credentials, no security headers, weak cookies.
  bad = await listen((req, res) => {
    const o = req.headers.origin;
    if (o) {
      res.setHeader("Access-Control-Allow-Origin", o);
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }
    res.setHeader("X-Powered-By", "Express");
    res.setHeader("Server", "nginx/1.18.0");
    res.setHeader("Set-Cookie", ["sessionid=abc; Path=/", "theme=dark; SameSite=None"]);
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE");
      res.writeHead(204);
      return res.end();
    }
    res.end("<html></html>");
  });

  // Well configured: strict headers, CORS allowlist with Vary.
  good = await listen((req, res) => {
    const o = req.headers.origin;
    res.setHeader("Content-Security-Policy", "default-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Permissions-Policy", "camera=()");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
    res.setHeader("Vary", "Origin");
    res.setHeader("Set-Cookie", "sid=1; Path=/; HttpOnly; SameSite=Lax");
    if (o === "https://app.example.com") {
      res.setHeader("Access-Control-Allow-Origin", o);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST");
      res.setHeader("Access-Control-Max-Age", "600");
    }
    res.writeHead(req.method === "OPTIONS" ? 204 : 200);
    res.end("ok");
  });

  // Flawed validation: accepts anything that starts with the host name.
  bypass = await listen((req, res) => {
    const o = req.headers.origin || "";
    if (o.startsWith("https://localhost")) {
      res.setHeader("Access-Control-Allow-Origin", o);
      res.setHeader("Vary", "Origin");
    }
    res.end("ok");
  });

  redirect = await listen((req, res) => {
    res.writeHead(302, { Location: `${good}/landing` });
    res.end();
  });
});

after(() => servers.forEach((s) => s.close()));

const ids = (r) => r.findings.map((f) => f.id);
const sev = (r, id) => r.findings.find((f) => f.id === id)?.severity;

test("flags a misconfigured server", async () => {
  const r = await analyze(bad);
  assert.equal(sev(r, "cors-reflect-credentials"), "critical");
  assert.equal(sev(r, "csp-missing"), "high");
  assert.equal(sev(r, "xcto-missing"), "medium");
  assert.equal(sev(r, "xfo-missing"), "medium");
  assert.equal(sev(r, "transport-http"), "high");
  assert.equal(sev(r, "cookie-httponly-missing"), "high"); // sessionid is session-like
  assert.ok(ids(r).includes("disclosure"));
  assert.ok(ids(r).includes("cookie-samesite-none"));
  assert.ok(ids(r).includes("cors-vary-missing"));
  assert.equal(r.score.grade, "F");
  assert.ok(r.score.value <= 40);
});

test("passes a well configured server and checks the caller's origin", async () => {
  const r = await analyze(good, { origin: "https://app.example.com" });
  for (const id of ["csp-ok", "xcto-ok", "referrer-ok", "permissions-ok", "framing-ok", "isolation-ok", "cors-restricted", "cors-test-allowed", "disclosure-ok"]) {
    assert.ok(ids(r).includes(id), `${id} missing, got ${ids(r)}`);
  }
  assert.ok(!ids(r).some((i) => i.startsWith("cors-reflect")));
  assert.ok(!ids(r).includes("cors-vary-missing"));
  assert.equal(r.findings.filter((f) => f.severity === "critical").length, 0);
});

test("reports when the caller's origin is not allowed", async () => {
  const r = await analyze(good, { origin: "https://other.example.org" });
  assert.equal(sev(r, "cors-test-blocked"), "info");
});

test("detects prefix-match origin bypass", async () => {
  const r = await analyze(bypass.replace("127.0.0.1", "localhost"));
  assert.equal(sev(r, "cors-origin-bypass"), "high");
});

test("follows redirects and records the chain", async () => {
  const r = await analyze(redirect);
  assert.equal(r.chain.length, 2);
  assert.equal(r.chain[0].status, 302);
  assert.ok(r.finalUrl.endsWith("/landing"));
});

test("rejects an invalid frontend origin and reports unreachable hosts", async () => {
  await assert.rejects(analyze(good, { origin: "not-an-origin" }), { status: 400 });
  await assert.rejects(analyze("http://127.0.0.1:9"), { status: 502 });
});

test("blocks private targets when the guard is on", async () => {
  process.env.ALLOW_PRIVATE_TARGETS = "false";
  try {
    await assert.rejects(analyze("http://127.0.0.1:8080"), { status: 400 });
    await assert.rejects(analyze("http://169.254.169.254/"), { status: 400 });
  } finally {
    process.env.ALLOW_PRIVATE_TARGETS = "true";
  }
});

test("scoring and grades", () => {
  assert.equal(computeScore([]).grade, "A+");
  assert.equal(computeScore([{ severity: "high" }]).grade, "B");
  assert.equal(computeScore([{ severity: "critical" }]).value, 40);
});
