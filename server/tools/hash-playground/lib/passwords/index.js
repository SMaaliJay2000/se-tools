import { PlaygroundError } from "../errors.js";
import argon2id from "./argon2id.js";
import bcrypt from "./bcrypt.js";
import pbkdf2 from "./pbkdf2.js";

// Adding an algorithm = one file exporting { id, displayName, description, formatExample, parameters, costParameter, canVerify, hash, verify } plus an entry here.
export const hashers = [bcrypt, argon2id, pbkdf2];

export function getHasher(id) {
  const h = hashers.find((x) => x.id === String(id).toLowerCase());
  if (!h) throw new PlaygroundError("unknown_algorithm", `Unknown password algorithm '${id}'. Supported: ${hashers.map((x) => x.id).join(", ")}.`);
  return h;
}

export function detectHasher(encoded) {
  const h = hashers.find((x) => x.canVerify(encoded));
  if (!h) throw new PlaygroundError("unrecognized_hash", "Could not recognise this hash. Expected a bcrypt ($2a$/$2b$/$2y$), Argon2id ($argon2id$) or PBKDF2 ($pbkdf2-sha256$) string.");
  return h;
}

/** The public description of a hasher (no functions), as served by GET /algorithms. */
export const describeHasher = ({ id, displayName, description, formatExample, costParameter, parameters }) => ({
  id,
  displayName,
  description,
  formatExample,
  costParameter,
  parameters,
});
