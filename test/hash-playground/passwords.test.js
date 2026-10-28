import test from "node:test";
import assert from "node:assert/strict";
import { decodeBcryptBase64 } from "../../server/tools/hash-playground/lib/passwords/bcrypt.js";
import { detectHasher, getHasher } from "../../server/tools/hash-playground/lib/passwords/index.js";

const PASSWORD = Buffer.from("correct horse battery staple");
const FAST = { bcrypt: { workFactor: 4 }, argon2id: { memoryKb: 64 }, pbkdf2: { iterations: 1000 } };

const rejects = (fn, code) => assert.rejects(fn, (e) => e.code === code, `expected ${code}`);

for (const id of ["bcrypt", "argon2id", "pbkdf2"]) {
  test(`${id}: hash then verify round-trips and rejects a wrong password`, async () => {
    const hasher = getHasher(id);
    const r = await hasher.hash(PASSWORD, FAST[id]);

    assert.equal(detectHasher(r.encoded).id, id);
    assert.equal((await hasher.verify(PASSWORD, r.encoded)).valid, true);
    assert.equal((await hasher.verify(Buffer.from("wrong"), r.encoded)).valid, false);
    assert.equal(r.salt.length, 16);
    assert.ok(r.hash.length >= 23 && r.elapsedMs > 0);
  });
}

test("every hash gets a fresh random salt", async () => {
  const pbkdf2 = getHasher("pbkdf2");
  const [a, b] = [await pbkdf2.hash(PASSWORD, FAST.pbkdf2), await pbkdf2.hash(PASSWORD, FAST.pbkdf2)];
  assert.notDeepEqual(a.salt, b.salt);
  assert.notDeepEqual(a.hash, b.hash);
});

// Hashes made by other stacks prove the formats interoperate, not just that we agree with ourselves.
const FOREIGN = [
  ["bcryptjs (Node), $2b$", "$2b$10$Y4gEWQ6IYAlhKFbjs5rwT.EsBDOjDreTQwY4oIpfzCYlEeQwmfrMC"],
  ["argon2-cffi (Python)", "$argon2id$v=19$m=19456,t=2,p=1$2nTnxFHuOo3Sc8dZb0ldBw$9UTxr1+Vz182Sa8INo/O43PRH8T07C3tzYT8Yd1l9xI"],
  ["argon2-cffi README", "$argon2id$v=19$m=65536,t=3,p=4$MIIRqgvgQbgj220jfp0MPA$YfwJSVjtjSU0zzV/P3S9nnQ/USre2wvJMjfCIjrTQbg"],
];

for (const [label, encoded] of FOREIGN) {
  test(`verifies a hash created by ${label}`, async () => {
    assert.equal((await detectHasher(encoded).verify(PASSWORD, encoded)).valid, true);
  });
}

test("pbkdf2 matches the published PBKDF2-HMAC-SHA256 vector (password/salt, 4096 rounds)", async () => {
  const hash = Buffer.from("c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a", "hex").toString("base64").replace(/=+$/, "");
  const encoded = `$pbkdf2-sha256$i=4096$c2FsdA$${hash}`;
  assert.equal((await getHasher("pbkdf2").verify(Buffer.from("password"), encoded)).valid, true);
});

test("bcrypt exposes decoded salt/hash bytes and warns when the password exceeds 72 bytes", async () => {
  const r = await getHasher("bcrypt").hash(Buffer.alloc(80, "a"), FAST.bcrypt);
  assert.equal(r.salt.length, 16);
  assert.equal(r.hash.length, 23);
  assert.ok(r.warnings.some((w) => w.includes("72")));
  // Truncation is part of the format: the first 72 bytes alone verify against it.
  assert.equal((await getHasher("bcrypt").verify(Buffer.alloc(72, "a"), r.encoded)).valid, true);
});

test("bcrypt base64 decoding matches the salt that was encoded", () => {
  // hash-wasm encodes a salt of sixteen 0x07 bytes as "/uaF/uaF/uaF/uaF/uaF/u"
  assert.deepEqual(decodeBcryptBase64("/uaF/uaF/uaF/uaF/uaF/u", 16), Buffer.alloc(16, 7));
});

test("out-of-range and unknown parameters are rejected", async () => {
  await rejects(() => getHasher("bcrypt").hash(PASSWORD, { workFactor: 3 }), "parameter_out_of_range");
  await rejects(() => getHasher("bcrypt").hash(PASSWORD, { workFactor: 15 }), "parameter_out_of_range");
  await rejects(() => getHasher("pbkdf2").hash(PASSWORD, { iterations: 999 }), "parameter_out_of_range");
  await rejects(() => getHasher("argon2id").hash(PASSWORD, { memoryKb: 999_999_999 }), "parameter_out_of_range");
  await rejects(() => getHasher("argon2id").hash(PASSWORD, { iterations: 0 }), "parameter_out_of_range");
  await rejects(() => getHasher("argon2id").hash(PASSWORD, { memoryKb: 8, parallelism: 2 }), "parameter_out_of_range");
  await rejects(() => getHasher("bcrypt").hash(PASSWORD, { rounds: 5 }), "unknown_parameter");
  await rejects(() => getHasher("bcrypt").hash(PASSWORD, { workFactor: 4.5 }), "parameter_out_of_range");
});

// A stored hash is untrusted input: it must not be able to demand unbounded CPU or RAM.
test("verify rejects hashes that demand excessive cost", async () => {
  const hostile = [
    "$2a$31$Y4gEWQ6IYAlhKFbjs5rwT.EsBDOjDreTQwY4oIpfzCYlEeQwmfrMC",
    "$argon2id$v=19$m=4194304,t=1,p=1$MIIRqgvgQbgj220jfp0MPA$YfwJSVjtjSU0zzV/P3S9nnQ/USre2wvJMjfCIjrTQbg",
    "$pbkdf2-sha256$i=2000000000$c2FsdA$AAAA",
  ];
  for (const encoded of hostile) await rejects(() => detectHasher(encoded).verify(PASSWORD, encoded), "parameter_out_of_range");
});

test("malformed hashes are reported, not thrown as server errors", async () => {
  for (const encoded of ["$2a$10$tooshort", "$argon2id$v=19$m=1,t=1$x$y", "$pbkdf2-sha256$nonsense"]) {
    await rejects(() => detectHasher(encoded).verify(PASSWORD, encoded), "malformed_hash");
  }
});

test("unrecognised and unknown algorithms are reported", () => {
  assert.throws(() => detectHasher("5f4dcc3b5aa765d61d8327deb882cf99"), { code: "unrecognized_hash" });
  assert.throws(() => getHasher("md5"), { code: "unknown_algorithm" });
});
