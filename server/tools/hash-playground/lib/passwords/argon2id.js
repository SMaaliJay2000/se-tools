import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";
import { PlaygroundError } from "../errors.js";
import { checkParam, resolveParams, spec } from "../params.js";
import { elapsedSince, fromB64NoPad, malformed, now } from "./common.js";

const MEMORY = spec("memoryKb", "Memory", 8, 131_072, 19_456, "KiB", "RAM per hash. OWASP minimum is 19,456 KiB (19 MiB) with t=2, p=1.");
const TIME = spec("iterations", "Iterations (t)", 1, 10, 2, "passes", "Passes over memory. Raise this once memory is as high as your server can afford.");
const LANES = spec("parallelism", "Parallelism (p)", 1, 16, 1, "lanes", "Lanes computed in parallel. Keep at 1 unless you want to trade cores for lower latency.");

// RFC 9106: memory must be at least 8 * parallelism KiB.
function requireMemoryForLanes(memoryKb, lanes) {
  if (memoryKb < 8 * lanes) {
    throw new PlaygroundError("parameter_out_of_range", `Memory must be at least 8 x parallelism KiB (${8 * lanes} KiB for p=${lanes}).`);
  }
}

const intParam = (kv, key) => (/^\d+$/.test(kv[key] ?? "") ? Number(kv[key]) : NaN);

export default {
  id: "argon2id",
  displayName: "Argon2id",
  description: "Memory-hard winner of the Password Hashing Competition and OWASP's first choice. Resists GPU/ASIC cracking by demanding RAM as well as CPU.",
  formatExample: "$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>",
  parameters: [MEMORY, TIME, LANES],
  costParameter: "memoryKb",

  canVerify: (encoded) => encoded.startsWith("$argon2id$"),

  async hash(password, overrides) {
    const p = resolveParams(this.parameters, overrides);
    requireMemoryForLanes(p.memoryKb, p.parallelism);

    const start = now();
    const encoded = await argon2id({
      password,
      salt: randomBytes(16),
      memorySize: p.memoryKb,
      iterations: p.iterations,
      parallelism: p.parallelism,
      hashLength: 32,
      outputType: "encoded",
    });
    const elapsedMs = elapsedSince(start);

    // $argon2id$v=19$m=..,t=..,p=..$salt$hash
    const parts = encoded.split("$");
    return { algorithm: this.id, encoded, salt: fromB64NoPad(parts[4]), hash: fromB64NoPad(parts[5]), parameters: p, elapsedMs, warnings: [] };
  },

  async verify(password, encoded) {
    // $argon2id$v=19$m=19456,t=2,p=1$salt$hash -> ["", "argon2id", "v=19", "m=..,t=..,p=..", salt, hash]
    const parts = encoded.split("$");
    if (parts.length !== 6 || parts[2] !== "v=19") throw malformed(this.displayName);

    const kv = Object.fromEntries(parts[3].split(",").map((x) => x.split("=")));
    const m = intParam(kv, "m");
    const t = intParam(kv, "t");
    const par = intParam(kv, "p");
    if ([m, t, par].some(Number.isNaN)) throw malformed(this.displayName);
    // The stored hash is untrusted input: bound its cost before spending any.
    checkParam(MEMORY, m);
    checkParam(TIME, t);
    checkParam(LANES, par);
    requireMemoryForLanes(m, par);
    const salt = fromB64NoPad(parts[4]);
    const hash = fromB64NoPad(parts[5]);
    if (!salt || salt.length < 8 || !hash || hash.length < 4) throw malformed(this.displayName);

    const start = now();
    let valid;
    try {
      valid = await argon2Verify({ password, hash: encoded });
    } catch {
      throw malformed(this.displayName);
    }
    return { valid, algorithm: this.id, parameters: { memoryKb: m, iterations: t, parallelism: par }, elapsedMs: elapsedSince(start) };
  },
};
