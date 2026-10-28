import { PlaygroundError } from "../errors.js";

export const now = () => process.hrtime.bigint();
export const elapsedSince = (start) => Number(process.hrtime.bigint() - start) / 1e6;

export const b64NoPad = (buf) => buf.toString("base64").replace(/=+$/, "");

/** Decodes unpadded base64 as used in PHC strings; returns null if it is not valid. */
export function fromB64NoPad(s) {
  if (typeof s !== "string" || !/^[A-Za-z0-9+/]+$/.test(s) || s.length % 4 === 1) return null;
  return Buffer.from(s, "base64");
}

export const malformed = (displayName) => new PlaygroundError("malformed_hash", `The string is not a valid ${displayName} hash.`);
