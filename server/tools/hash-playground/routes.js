import express, { Router } from "express";
import { createRateLimiter, limitConcurrency } from "../../shared/rate-limit.js";
import { AES_GCM_INFO, decrypt, encrypt } from "./lib/aes-gcm.js";
import { runBenchmark, MAX_POINTS, MAX_REPEATS } from "./lib/benchmark.js";
import { DIGESTS, digest, hmac } from "./lib/digest.js";
import { decode, toBytesDto, tryUtf8, ENCODINGS } from "./lib/encoding.js";
import { PlaygroundError } from "./lib/errors.js";
import { describeHasher, detectHasher, getHasher, hashers } from "./lib/passwords/index.js";
import { recommend } from "./lib/tuning.js";
import { number, oneOf, optStr, str } from "./lib/validate.js";

const router = Router();
router.use(express.json({ limit: "1mb" }));
router.use(createRateLimiter({ max: 120, message: "Too many requests. Wait a minute and try again." }));

// Hashing is deliberately expensive: cap how many run at once on one instance, and throttle them harder.
const heavy = [
  createRateLimiter({ max: 40, message: "Too many hashing requests. Wait a minute and try again." }),
  limitConcurrency({ max: 2, message: "The server is busy hashing. Try again in a moment." }),
];

/** Wraps a handler: user-correctable PlaygroundErrors become their HTTP status, anything else a generic 500. */
const route = (handler) => async (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await handler(req.body ?? {}));
  } catch (e) {
    if (e instanceof PlaygroundError) return res.status(e.status).json({ error: e.message, code: e.code });
    console.error(e);
    res.status(500).json({ error: "Something went wrong. Try again." });
  }
};

const optBase64 = (body, name, max) => {
  const v = optStr(body, name, { max });
  return v === undefined ? undefined : decode(v, "base64", name);
};

router.get("/algorithms", (_req, res) =>
  res.json({
    digests: DIGESTS,
    hmacs: DIGESTS,
    passwords: hashers.map(describeHasher),
    aesGcm: AES_GCM_INFO,
    benchmark: { maxPoints: MAX_POINTS, maxRepeats: MAX_REPEATS },
  }),
);

router.post(
  "/digest",
  route((body) => {
    const algorithm = oneOf(body, "algorithm", DIGESTS);
    const input = decode(str(body, "input", { max: 200_000, allowEmpty: true }), oneOf(body, "inputEncoding", ENCODINGS, "utf8"), "Input");
    return { algorithm, inputLength: input.length, digest: toBytesDto(digest(algorithm, input)) };
  }),
);

router.post(
  "/hmac",
  route((body) => {
    const algorithm = oneOf(body, "algorithm", DIGESTS);
    const key = decode(str(body, "key", { max: 10_000 }), oneOf(body, "keyEncoding", ENCODINGS, "utf8"), "Key");
    const message = decode(str(body, "message", { max: 200_000, allowEmpty: true }), oneOf(body, "messageEncoding", ENCODINGS, "utf8"), "Message");
    return { algorithm, mac: toBytesDto(hmac(algorithm, key, message)) };
  }),
);

router.post(
  "/password/hash",
  heavy,
  route(async (body) => {
    const hasher = getHasher(str(body, "algorithm", { max: 32 }));
    const password = Buffer.from(str(body, "password", { max: 1024 }), "utf8");
    const r = await hasher.hash(password, body.parameters);
    return { ...r, salt: toBytesDto(r.salt), hash: toBytesDto(r.hash) };
  }),
);

router.post(
  "/password/verify",
  heavy,
  route(async (body) => {
    const encoded = str(body, "encoded", { max: 512 }).trim();
    const password = Buffer.from(str(body, "password", { max: 1024 }), "utf8");
    return detectHasher(encoded).verify(password, encoded);
  }),
);

router.post(
  "/aes-gcm/encrypt",
  route((body) => {
    const plaintext = decode(str(body, "plaintext", { max: 200_000, allowEmpty: true }), oneOf(body, "plaintextEncoding", ENCODINGS, "utf8"), "Plaintext");
    const aad = optStr(body, "aad", { max: 10_000 });
    const r = encrypt({ plaintext, key: optBase64(body, "key", 64), iv: optBase64(body, "iv", 32), aad: aad && Buffer.from(aad, "utf8") });
    return {
      key: toBytesDto(r.key),
      iv: toBytesDto(r.iv),
      ciphertext: toBytesDto(r.ciphertext),
      tag: toBytesDto(r.tag),
      combined: toBytesDto(Buffer.concat([r.iv, r.ciphertext, r.tag])), // iv || ciphertext || tag: the layout most libraries use on the wire
      warnings: r.warnings,
    };
  }),
);

router.post(
  "/aes-gcm/decrypt",
  route((body) => {
    const aad = optStr(body, "aad", { max: 10_000 });
    const plaintext = decrypt({
      key: decode(str(body, "key", { max: 64 }), "base64", "Key"),
      iv: decode(str(body, "iv", { max: 32 }), "base64", "IV"),
      ciphertext: decode(str(body, "ciphertext", { max: 300_000, allowEmpty: true }), "base64", "Ciphertext"),
      tag: decode(str(body, "tag", { max: 32 }), "base64", "Tag"),
      aad: aad && Buffer.from(aad, "utf8"),
    });
    return { text: tryUtf8(plaintext), plaintext: toBytesDto(plaintext) };
  }),
);

router.post(
  "/benchmark",
  heavy,
  route((body) =>
    runBenchmark({
      algorithm: str(body, "algorithm", { max: 32 }),
      parameter: str(body, "parameter", { max: 32 }),
      values: body.values,
      fixed: body.fixed,
      repeats: body.repeats ?? 1,
    }),
  ),
);

router.post(
  "/tuning/recommend",
  heavy,
  route((body) => recommend({ targetMs: number(body, "targetMs", { min: 50, max: 2000, fallback: 250 }), argon2MemoryKb: number(body, "argon2MemoryKb", { min: 8192, max: 131_072, fallback: 65_536 }) })),
);

export default router;
