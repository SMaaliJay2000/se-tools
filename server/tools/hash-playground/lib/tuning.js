import { getHasher } from "./passwords/index.js";

const SAMPLE_PASSWORD = Buffer.from("correct horse battery staple");
const BCRYPT_OWASP_MIN = 10;
const PBKDF2_OWASP_MIN = 600_000;

const time = async (hasher, params) => (await hasher.hash(SAMPLE_PASSWORD, params)).elapsedMs;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

async function tuneBcrypt(target) {
  const hasher = getHasher("bcrypt");
  const max = hasher.parameters[0].max;
  let cost = BCRYPT_OWASP_MIN;
  let ms = await time(hasher, { workFactor: cost });

  // Each +1 doubles the time, so stop at the first cost whose successor would overshoot.
  while (cost < max) {
    const next = await time(hasher, { workFactor: cost + 1 });
    if (next > target) break;
    cost++;
    ms = next;
  }
  const note =
    ms > target
      ? `Even the OWASP minimum (cost ${BCRYPT_OWASP_MIN}) exceeds the target here; keep ${BCRYPT_OWASP_MIN} anyway.`
      : cost === max
        ? "Hit the playground's ceiling; production could go higher."
        : "Largest cost within the target.";
  return { algorithm: hasher.id, parameters: { workFactor: cost }, measuredMs: ms, note };
}

async function tunePbkdf2(target) {
  const hasher = getHasher("pbkdf2");
  const { min, max } = hasher.parameters[0];
  await time(hasher, { iterations: 10_000 }); // warm-up
  const probe = 100_000;
  const perIteration = (await time(hasher, { iterations: probe })) / probe;

  // PBKDF2 is linear in iterations, so one probe is enough; round to thousands for a tidy number.
  const iterations = clamp(Math.floor(target / perIteration / 1000) * 1000, min, max);
  const ms = await time(hasher, { iterations });
  const note = iterations < PBKDF2_OWASP_MIN ? `Below OWASP's ${PBKDF2_OWASP_MIN.toLocaleString("en-US")} minimum for HMAC-SHA256; raise the time budget or prefer Argon2id.` : "Linear scaling from a 100,000-round probe.";
  return { algorithm: hasher.id, parameters: { iterations }, measuredMs: ms, note };
}

async function tuneArgon2id(target, memoryKb) {
  const hasher = getHasher("argon2id");
  const max = hasher.parameters.find((p) => p.name === "iterations").max;
  await time(hasher, { memoryKb: 8192, iterations: 1 }); // warm-up
  const one = await time(hasher, { memoryKb, iterations: 1, parallelism: 1 });

  // Time is linear in passes at fixed memory: fix memory to what you can afford, then spend the rest of the budget on t.
  const t = clamp(Math.floor(target / one), 1, max);
  const ms = t === 1 ? one : await time(hasher, { memoryKb, iterations: t, parallelism: 1 });
  const note =
    one > target
      ? `One pass at ${Math.round(memoryKb / 1024)} MiB already exceeds the target; lower the memory.`
      : memoryKb >= 46 * 1024 || (memoryKb >= 19 * 1024 && t >= 2)
        ? "Meets OWASP's Argon2id minimums (46 MiB/t=1 or 19 MiB/t=2)."
        : "Below OWASP's Argon2id minimums; raise memory first.";
  return { algorithm: hasher.id, parameters: { memoryKb, iterations: t, parallelism: 1 }, measuredMs: ms, note };
}

/** Finds, per algorithm, the strongest parameters whose hash time stays at or under `targetMs` on this machine. */
export async function recommend({ targetMs, argon2MemoryKb }) {
  // Sequential on purpose: concurrent runs would distort each other's timings.
  return [await tuneBcrypt(targetMs), await tunePbkdf2(targetMs), await tuneArgon2id(targetMs, argon2MemoryKb)];
}
