import { PlaygroundError } from "./errors.js";

export const ENCODINGS = ["utf8", "hex", "base64"];

/** Turns a wire string into bytes. `field` names the input in error messages. */
export function decode(value, encoding, field) {
  if (typeof value !== "string") throw new PlaygroundError("invalid_input", `${field} must be a string.`);
  if (!ENCODINGS.includes(encoding)) throw new PlaygroundError("invalid_encoding", `Encoding must be one of ${ENCODINGS.join(", ")}.`);
  if (encoding === "utf8") return Buffer.from(value, "utf8");
  if (encoding === "hex") {
    const hex = value.replace(/\s+/g, "");
    if (hex.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(hex)) throw new PlaygroundError("invalid_encoding", `${field} is not valid hex.`);
    return Buffer.from(hex, "hex");
  }
  const b64 = value.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(b64) || b64.replace(/=+$/, "").length % 4 === 1) {
    throw new PlaygroundError("invalid_encoding", `${field} is not valid base64.`);
  }
  return Buffer.from(b64, "base64");
}

/** Bytes rendered both ways so the UI (and any client stack) can pick whichever it needs. */
export const toBytesDto = (buf) => ({ hex: buf.toString("hex"), base64: buf.toString("base64"), length: buf.length });

/** UTF-8 text, or null when the bytes are not valid UTF-8 (binary payload, or noise from a wrong key). */
export function tryUtf8(buf) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf);
  } catch {
    return null;
  }
}
