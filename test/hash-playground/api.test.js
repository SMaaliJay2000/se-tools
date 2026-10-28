import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import app from "../../server/app.js";

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/hash-playground`;
});
after(() => server.close());

async function post(path, body, expected = 200) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(res.status, expected, `${path} -> ${res.status}`);
  return res.json();
}

test("GET /algorithms describes every algorithm so the UI needs no hard-coded limits", async () => {
  const json = await (await fetch(`${base}/algorithms`)).json();
  assert.deepEqual(json.passwords.map((p) => p.id), ["bcrypt", "argon2id", "pbkdf2"]);
  assert.equal(json.passwords[0].parameters[0].name, "workFactor");
  assert.equal(json.aesGcm.ivBytes, 12);
  assert.ok(!JSON.stringify(json).includes("hash("), "no functions leak into the response");
});

test("digest accepts hex input and returns both encodings", async () => {
  const json = await post("/digest", { algorithm: "sha256", input: "616263", inputEncoding: "hex" });
  assert.equal(json.digest.hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(json.digest.length, 32);
  assert.equal(json.inputLength, 3);
});

test("hmac matches RFC 4231", async () => {
  const json = await post("/hmac", { algorithm: "sha256", key: "Jefe", message: "what do ya want for nothing?" });
  assert.equal(json.mac.hex, "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
});

test("password hash then verify detects the algorithm from the string", async () => {
  const hashed = await post("/password/hash", { algorithm: "argon2id", password: "hunter2", parameters: { memoryKb: 64, iterations: 1 } });
  assert.equal(hashed.salt.length, 16);
  assert.match(hashed.encoded, /^\$argon2id\$/);

  const ok = await post("/password/verify", { password: "hunter2", encoded: hashed.encoded });
  const bad = await post("/password/verify", { password: "hunter3", encoded: hashed.encoded });
  assert.equal(ok.valid, true);
  assert.equal(ok.algorithm, "argon2id");
  assert.equal(bad.valid, false);
});

test("domain errors are JSON with a stable code and status 400", async () => {
  assert.equal((await post("/password/hash", { algorithm: "md5", password: "x" }, 400)).code, "unknown_algorithm");
  assert.equal((await post("/password/hash", { algorithm: "bcrypt", password: "x", parameters: { workFactor: 99 } }, 400)).code, "parameter_out_of_range");
  assert.equal((await post("/password/hash", { algorithm: "bcrypt" }, 400)).code, "invalid_input");
  assert.equal((await post("/digest", { algorithm: "sha1", input: "x" }, 400)).code, "invalid_input");
});

test("malformed JSON gets a JSON error, not an HTML page", async () => {
  const res = await fetch(`${base}/digest`, { method: "POST", headers: { "content-type": "application/json" }, body: "{nope" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /not valid JSON/);
});

test("AES-GCM round-trip, then tamper detection through the API", async () => {
  const enc = await post("/aes-gcm/encrypt", { plaintext: "hello gcm", aad: "ctx" });
  const payload = { key: enc.key.base64, iv: enc.iv.base64, ciphertext: enc.ciphertext.base64, tag: enc.tag.base64, aad: "ctx" };

  const dec = await post("/aes-gcm/decrypt", payload);
  assert.equal(dec.text, "hello gcm");
  assert.equal(enc.combined.length, 12 + 9 + 16);

  const bad = await post("/aes-gcm/decrypt", { ...payload, aad: "other" }, 400);
  assert.equal(bad.code, "auth_failed");
});

test("benchmark returns one point per value", async () => {
  const json = await post("/benchmark", { algorithm: "bcrypt", parameter: "workFactor", values: [4, 5] });
  assert.deepEqual(json.points.map((p) => p.value), [4, 5]);
  assert.equal((await post("/benchmark", { algorithm: "bcrypt", parameter: "workFactor", values: [4, 99] }, 400)).code, "parameter_out_of_range");
});

test("tools are mounted under /api/<id>; unknown API paths are 404 JSON", async () => {
  const root = base.replace("/hash-playground", "");
  const res = await fetch(`${root}/header-check/analyze`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: "http://localhost" }) });
  assert.equal(res.status, 400); // blocked by the SSRF guard, proving the header-check router is mounted
  assert.equal((await fetch(`${root}/nope`)).status, 404);
});
