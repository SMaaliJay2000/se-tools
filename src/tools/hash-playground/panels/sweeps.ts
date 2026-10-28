import type { ParameterSpec } from "../types";

/** Sensible x-axis values per algorithm/parameter: doubling steps, so a straight line on the log chart means "linear cost". */
const PRESETS: Record<string, number[]> = {
  "bcrypt.workFactor": [8, 9, 10, 11, 12, 13],
  "pbkdf2.iterations": [50_000, 100_000, 200_000, 400_000, 800_000, 1_600_000],
  "argon2id.memoryKb": [8_192, 16_384, 32_768, 65_536, 131_072],
  "argon2id.iterations": [1, 2, 3, 4, 6, 8],
  "argon2id.parallelism": [1, 2, 4, 8],
};

export function defaultSweep(algorithm: string, spec: ParameterSpec): number[] {
  const preset = PRESETS[`${algorithm}.${spec.name}`];
  if (preset) return preset;
  // Fallback: powers of two around the default.
  const v = [0.25, 0.5, 1, 2, 4].map((f) => Math.round(spec.default * f));
  return [...new Set(v.map((x) => Math.min(spec.max, Math.max(spec.min, x))))];
}

/** Parses "8, 9 10" into numbers; returns an error message instead when a value is invalid or out of range. */
export function parseSweep(text: string, spec: ParameterSpec, maxPoints: number): { values: number[] } | { error: string } {
  const values = text.split(/[,\s]+/).filter(Boolean).map(Number);
  if (values.length === 0) return { error: "Enter at least one value." };
  if (values.length > maxPoints) return { error: `At most ${maxPoints} values.` };
  const bad = values.find((v) => !Number.isInteger(v) || v < spec.min || v > spec.max);
  if (bad !== undefined) return { error: `${spec.label} must be an integer from ${spec.min} to ${spec.max}.` };
  return { values };
}
