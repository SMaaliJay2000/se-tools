import { PlaygroundError } from "./errors.js";

/** One tunable knob of a password hash, with the bounds the API enforces. */
export const spec = (name, label, min, max, def, unit, hint) => ({ name, label, min, max, default: def, unit, hint });

/**
 * Also applied to values parsed out of an untrusted encoded hash, so a crafted
 * string cannot demand unbounded CPU or memory.
 */
export function checkParam(s, value) {
  if (!Number.isInteger(value) || value < s.min || value > s.max) {
    throw new PlaygroundError("parameter_out_of_range", `${s.label} must be an integer between ${s.min.toLocaleString("en-US")} and ${s.max.toLocaleString("en-US")}.`);
  }
}

/** Applies defaults, rejects unknown names and out-of-range values. */
export function resolveParams(specs, overrides) {
  if (overrides != null && (typeof overrides !== "object" || Array.isArray(overrides))) {
    throw new PlaygroundError("invalid_input", "parameters must be an object.");
  }
  const unknown = Object.keys(overrides ?? {}).find((k) => !specs.some((s) => s.name === k));
  if (unknown) throw new PlaygroundError("unknown_parameter", `Unknown parameter '${unknown}'. Valid: ${specs.map((s) => s.name).join(", ")}.`);

  const out = {};
  for (const s of specs) {
    const value = overrides && s.name in overrides ? overrides[s.name] : s.default;
    checkParam(s, value);
    out[s.name] = value;
  }
  return out;
}
