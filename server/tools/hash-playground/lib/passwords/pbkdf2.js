import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { checkParam, resolveParams, spec } from "../params.js";
import { b64NoPad, elapsedSince, fromB64NoPad, malformed, now } from "./common.js";

const pbkdf2Async = promisify(pbkdf2);
const PREFIX = "$pbkdf2-sha256$";
const SALT_BYTES = 16;
const HASH_BYTES = 32;

const ITERATIONS = spec("iterations", "Iterations", 1_000, 5_000_000, 600_000, "rounds", "OWASP minimum for HMAC-SHA256 is 600,000. Time grows linearly.");

/** PBKDF2-HMAC-SHA256, encoded as $pbkdf2-sha256$i=600000$salt$hash (PHC-style, unpadded base64). */
export default {
  id: "pbkdf2",
  displayName: "PBKDF2-HMAC-SHA256",
  description: "NIST/FIPS-approved KDF. CPU-bound only, so GPUs and ASICs attack it cheaply; pick it when FIPS compliance is required.",
  formatExample: "$pbkdf2-sha256$i=600000$<salt>$<hash>",
  parameters: [ITERATIONS],
  costParameter: "iterations",

  canVerify: (encoded) => encoded.startsWith(PREFIX),

  async hash(password, overrides) {
    const p = resolveParams(this.parameters, overrides);
    const salt = randomBytes(SALT_BYTES);

    const start = now();
    const hash = await pbkdf2Async(password, salt, p.iterations, HASH_BYTES, "sha256");
    const elapsedMs = elapsedSince(start);

    return { algorithm: this.id, encoded: `${PREFIX}i=${p.iterations}$${b64NoPad(salt)}$${b64NoPad(hash)}`, salt, hash, parameters: p, elapsedMs, warnings: [] };
  },

  async verify(password, encoded) {
    // $pbkdf2-sha256$i=600000$salt$hash -> ["", "pbkdf2-sha256", "i=600000", salt, hash]
    const parts = encoded.split("$");
    if (parts.length !== 5 || !/^i=\d+$/.test(parts[2])) throw malformed(this.displayName);
    // The stored hash is untrusted input: bound its cost before spending any.
    const iterations = Number(parts[2].slice(2));
    checkParam(ITERATIONS, iterations);
    const salt = fromB64NoPad(parts[3]);
    const expected = fromB64NoPad(parts[4]);
    if (!salt?.length || !expected?.length) throw malformed(this.displayName);

    const start = now();
    const actual = await pbkdf2Async(password, salt, iterations, expected.length, "sha256");
    return { valid: timingSafeEqual(actual, expected), algorithm: this.id, parameters: { iterations }, elapsedMs: elapsedSince(start) };
  },
};
