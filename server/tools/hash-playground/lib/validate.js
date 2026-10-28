import { PlaygroundError } from "./errors.js";

const invalid = (message) => new PlaygroundError("invalid_input", message);

/** Required string field. Empty strings are rejected unless `allowEmpty`. */
export function str(body, name, { max, allowEmpty = false } = {}) {
  const v = body?.[name];
  if (typeof v !== "string") throw invalid(`${name} is required and must be a string.`);
  if (!allowEmpty && v.length === 0) throw invalid(`${name} must not be empty.`);
  if (max && v.length > max) throw invalid(`${name} is too long (max ${max.toLocaleString("en-US")} characters).`);
  return v;
}

/** Optional string field; undefined and empty both mean "not provided". */
export function optStr(body, name, { max } = {}) {
  const v = body?.[name];
  if (v === undefined || v === null || v === "") return undefined;
  return str(body, name, { max });
}

export function oneOf(body, name, allowed, fallback) {
  const v = body?.[name] ?? fallback;
  if (!allowed.includes(v)) throw invalid(`${name} must be one of: ${allowed.join(", ")}.`);
  return v;
}

export function number(body, name, { min, max, fallback }) {
  const v = body?.[name] ?? fallback;
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw invalid(`${name} must be a number between ${min} and ${max}.`);
  return v;
}
