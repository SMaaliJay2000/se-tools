import { createHash, createHmac } from "node:crypto";
import { PlaygroundError } from "./errors.js";

export const DIGESTS = ["sha256", "sha384", "sha512"];

function assertAlgorithm(algorithm, kind) {
  if (!DIGESTS.includes(algorithm)) throw new PlaygroundError("unknown_algorithm", `Unknown ${kind} '${algorithm}'. Supported: ${DIGESTS.join(", ")}.`);
}

export function digest(algorithm, data) {
  assertAlgorithm(algorithm, "digest");
  return createHash(algorithm).update(data).digest();
}

export function hmac(algorithm, key, message) {
  assertAlgorithm(algorithm, "HMAC hash");
  return createHmac(algorithm, key).update(message).digest();
}
