import { randomBytes } from "node:crypto";
import { bcrypt, bcryptVerify } from "hash-wasm";
import { checkParam, resolveParams, spec } from "../params.js";
import { elapsedSince, malformed, now } from "./common.js";

const MAX_PASSWORD_BYTES = 72;
const ALPHABET = "./ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

const WORK_FACTOR = spec("workFactor", "Cost factor", 4, 14, 12, "log2 rounds", "Each +1 doubles the time. OWASP recommends at least 10; most servers land on 12-13.");

/** Decodes bcrypt's base64 variant (alphabet "./A-Za-z0-9", no padding) into `byteCount` bytes. */
export function decodeBcryptBase64(s, byteCount) {
  const out = Buffer.alloc(byteCount);
  let bits = 0;
  let acc = 0;
  let o = 0;
  for (const c of s) {
    acc = (acc << 6) | ALPHABET.indexOf(c);
    bits += 6;
    if (bits >= 8 && o < byteCount) {
      bits -= 8;
      out[o++] = (acc >> bits) & 0xff;
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

/** bcrypt ignores everything past byte 72. Truncate explicitly so every stack agrees on what was hashed. */
const limit = (password) => password.subarray(0, MAX_PASSWORD_BYTES);

export default {
  id: "bcrypt",
  displayName: "bcrypt",
  description: "Battle-tested since 1999 and supported everywhere. Fixed 4 KiB of memory, so GPUs attack it better than Argon2; input is truncated at 72 bytes.",
  formatExample: "$2a$12$<22-char salt><31-char hash>",
  parameters: [WORK_FACTOR],
  costParameter: "workFactor",

  canVerify: (encoded) => /^\$2[aby]\$/.test(encoded),

  async hash(password, overrides) {
    const p = resolveParams(this.parameters, overrides);
    const warnings = [];
    if (password.length > MAX_PASSWORD_BYTES) {
      warnings.push(`bcrypt only uses the first ${MAX_PASSWORD_BYTES} bytes of the password; the rest is ignored. Pre-hash long inputs or use Argon2id.`);
    }
    const start = now();
    const encoded = await bcrypt({ password: limit(password), salt: randomBytes(16), costFactor: p.workFactor, outputType: "encoded" });
    const elapsedMs = elapsedSince(start);

    // $2a$12$ (7 chars) + 22-char salt + 31-char hash, both in bcrypt's own base64 alphabet.
    return {
      algorithm: this.id,
      encoded,
      salt: decodeBcryptBase64(encoded.slice(7, 29), 16),
      hash: decodeBcryptBase64(encoded.slice(29), 23),
      parameters: p,
      elapsedMs,
      warnings,
    };
  },

  async verify(password, encoded) {
    if (encoded.length !== 60 || !/^\$2[aby]\$\d\d\$/.test(encoded)) throw malformed(this.displayName);
    // The stored hash is untrusted input: bound its cost before spending any.
    const cost = Number(encoded.slice(4, 6));
    checkParam(WORK_FACTOR, cost);

    const start = now();
    let valid;
    try {
      valid = await bcryptVerify({ password: limit(password), hash: encoded });
    } catch {
      throw malformed(this.displayName);
    }
    return { valid, algorithm: this.id, parameters: { workFactor: cost }, elapsedMs: elapsedSince(start) };
  },
};
