import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { PlaygroundError } from "./errors.js";

const IV_BYTES = 12;
const TAG_BYTES = 16;
const DEFAULT_KEY_BYTES = 32;

export const AES_GCM_INFO = { keyBits: [128, 192, 256], ivBytes: IV_BYTES, tagBytes: TAG_BYTES };

function requireSizes(key, iv) {
  if (![16, 24, 32].includes(key.length)) throw new PlaygroundError("invalid_key", `Key must be 16, 24 or 32 bytes (AES-128/192/256); got ${key.length}.`);
  if (iv.length !== IV_BYTES) throw new PlaygroundError("invalid_iv", `IV must be ${IV_BYTES} bytes (96-bit nonce); got ${iv.length}.`);
}

const algorithmFor = (key) => `aes-${key.length * 8}-gcm`;

/** key / iv / aad are optional Buffers. A missing key becomes a fresh 256-bit key, a missing IV a fresh random one. */
export function encrypt({ plaintext, key, iv, aad }) {
  const warnings = [];
  key ??= randomBytes(DEFAULT_KEY_BYTES);
  if (iv) {
    warnings.push("You supplied the IV. Reusing an IV with the same key breaks AES-GCM completely (it leaks plaintext XORs and lets attackers forge tags). Let the server generate a fresh one.");
  } else {
    iv = randomBytes(IV_BYTES);
  }
  requireSizes(key, iv);

  const cipher = createCipheriv(algorithmFor(key), key, iv, { authTagLength: TAG_BYTES });
  if (aad) cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { key, iv, ciphertext, tag: cipher.getAuthTag(), warnings };
}

export function decrypt({ key, iv, ciphertext, tag, aad }) {
  requireSizes(key, iv);
  if (tag.length !== TAG_BYTES) throw new PlaygroundError("invalid_tag", `Authentication tag must be ${TAG_BYTES} bytes (got ${tag.length}).`);

  const decipher = createDecipheriv(algorithmFor(key), key, iv, { authTagLength: TAG_BYTES });
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new PlaygroundError("auth_failed", "Authentication failed: wrong key, IV or AAD, or the ciphertext/tag was modified. No plaintext is released.");
  }
}
