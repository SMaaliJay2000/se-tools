import test from "node:test";
import assert from "node:assert/strict";
import { decrypt, encrypt } from "../../server/tools/hash-playground/lib/aes-gcm.js";
import { digest, hmac } from "../../server/tools/hash-playground/lib/digest.js";
import { decode } from "../../server/tools/hash-playground/lib/encoding.js";

const utf8 = (s) => Buffer.from(s, "utf8");

test("SHA-2 matches the FIPS 180 'abc' vectors", () => {
  assert.equal(digest("sha256", utf8("abc")).toString("hex"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(
    digest("sha512", utf8("abc")).toString("hex"),
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
  );
});

test("HMAC-SHA256 matches RFC 4231 test case 2", () => {
  assert.equal(hmac("sha256", utf8("Jefe"), utf8("what do ya want for nothing?")).toString("hex"), "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
});

test("unknown digest algorithms are rejected", () => {
  assert.throws(() => digest("md5", Buffer.alloc(0)), { code: "unknown_algorithm" });
  assert.throws(() => hmac("md5", utf8("k"), Buffer.alloc(0)), { code: "unknown_algorithm" });
});

test("decode validates hex and base64 strictly", () => {
  assert.deepEqual(decode("61 62 63", "hex", "x"), utf8("abc"));
  assert.deepEqual(decode("YWJj", "base64", "x"), utf8("abc"));
  assert.throws(() => decode("abc", "hex", "x"), { code: "invalid_encoding" });
  assert.throws(() => decode("zz", "hex", "x"), { code: "invalid_encoding" });
  assert.throws(() => decode("not base64!", "base64", "x"), { code: "invalid_encoding" });
  assert.throws(() => decode(5, "utf8", "x"), { code: "invalid_input" });
});

test("AES-GCM round-trips with a generated key and IV, binding the AAD", () => {
  const enc = encrypt({ plaintext: utf8("attack at dawn"), aad: utf8("header") });
  assert.equal(enc.key.length, 32);
  assert.equal(enc.iv.length, 12);
  assert.equal(enc.tag.length, 16);
  assert.deepEqual(enc.warnings, []);
  assert.equal(decrypt({ ...enc, aad: utf8("header") }).toString("utf8"), "attack at dawn");
});

test("AES-GCM matches GCM spec test case 2 (all-zero key, IV and block)", () => {
  const enc = encrypt({ plaintext: Buffer.alloc(16), key: Buffer.alloc(16), iv: Buffer.alloc(12) });
  assert.equal(enc.ciphertext.toString("hex"), "0388dace60b6a392f328c2b971b2fe78");
  assert.equal(enc.tag.toString("hex"), "ab6e47d42cec13bdf53a67b21257bddf");
});

test("AES-GCM warns when the caller supplies the IV", () => {
  assert.equal(encrypt({ plaintext: utf8("x"), iv: Buffer.alloc(12) }).warnings.length, 1);
});

test("AES-GCM refuses tampered ciphertext, wrong AAD, and bad key/IV sizes", () => {
  const enc = encrypt({ plaintext: utf8("secret"), aad: utf8("aad") });
  const flipped = Buffer.from(enc.ciphertext);
  flipped[0] ^= 1;

  assert.throws(() => decrypt({ ...enc, ciphertext: flipped, aad: utf8("aad") }), { code: "auth_failed" });
  assert.throws(() => decrypt({ ...enc, aad: utf8("other") }), { code: "auth_failed" });
  assert.throws(() => encrypt({ plaintext: utf8("x"), key: Buffer.alloc(5) }), { code: "invalid_key" });
  assert.throws(() => encrypt({ plaintext: utf8("x"), iv: Buffer.alloc(8) }), { code: "invalid_iv" });
});

test("AES-GCM accepts a 128-bit key", () => {
  const key = Buffer.alloc(16, 1);
  const enc = encrypt({ plaintext: utf8("hello"), key });
  assert.equal(enc.key.length, 16);
  assert.equal(decrypt({ ...enc }).toString(), "hello");
});
