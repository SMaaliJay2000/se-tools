import { PlaygroundError } from "./errors.js";
import { checkParam } from "./params.js";
import { getHasher } from "./passwords/index.js";

export const MAX_POINTS = 12;
export const MAX_REPEATS = 3;
// vercel.json allows 30 s per request; leave room for the hash that is already running when the budget expires.
const BUDGET_MS = 15_000;
const SAMPLE_PASSWORD = Buffer.from("correct horse battery staple");

/** Hashes a fixed password once per value (median of `repeats`) and reports wall-clock time on this machine. */
export async function runBenchmark({ algorithm, parameter, values, fixed, repeats }) {
  const hasher = getHasher(algorithm);
  const spec = hasher.parameters.find((p) => p.name === parameter);
  if (!spec) throw new PlaygroundError("unknown_parameter", `${hasher.displayName} has no parameter '${parameter}'. Valid: ${hasher.parameters.map((p) => p.name).join(", ")}.`);
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_POINTS) throw new PlaygroundError("invalid_values", `Provide between 1 and ${MAX_POINTS} values to benchmark.`);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > MAX_REPEATS) throw new PlaygroundError("invalid_repeats", `Repeats must be between 1 and ${MAX_REPEATS}.`);

  const withValue = (v) => ({ ...(fixed ?? {}), [spec.name]: v });

  // Reject out-of-range values before spending any time, then do one cheap hash to absorb warm-up cost.
  for (const v of values) checkParam(spec, v);
  await hasher.hash(SAMPLE_PASSWORD, withValue(spec.min));

  const started = Date.now();
  const points = [];
  let truncated = false;
  for (const value of values) {
    if (Date.now() - started > BUDGET_MS) {
      truncated = true;
      break;
    }
    const runs = [];
    for (let i = 0; i < repeats; i++) runs.push((await hasher.hash(SAMPLE_PASSWORD, withValue(value))).elapsedMs);
    runs.sort((a, b) => a - b);
    points.push({ value, elapsedMs: runs[Math.floor(runs.length / 2)] });
  }
  return { algorithm: hasher.id, parameter: spec.name, points, truncated };
}
