/** Static guidance, after the OWASP Password Storage Cheat Sheet. Verify against the current revision before shipping. */

export const ARGON2_PROFILES = [
  { memory: "46 MiB", memoryKb: 47_104, t: 1, p: 1, note: "Fastest if RAM is plentiful" },
  { memory: "19 MiB", memoryKb: 19_456, t: 2, p: 1, note: "OWASP baseline and this app’s default" },
  { memory: "12 MiB", memoryKb: 12_288, t: 3, p: 1, note: "When RAM per login is tight" },
  { memory: "9 MiB", memoryKb: 9_216, t: 4, p: 1, note: "" },
  { memory: "7 MiB", memoryKb: 7_168, t: 5, p: 1, note: "Smallest accepted footprint" },
];

export const PBKDF2_MINIMUMS = [
  { prf: "HMAC-SHA256", iterations: "600,000" },
  { prf: "HMAC-SHA512", iterations: "210,000" },
  { prf: "HMAC-SHA1", iterations: "1,300,000" },
];

export const BCRYPT_RULES = [
  "Use cost 10 as an absolute floor; 12–13 is common on current servers.",
  "Every +1 doubles the time: raising cost 10 → 12 makes each guess 4× more expensive for attackers (and for you).",
  "Only the first 72 bytes of the password count, and a NUL byte ends it in some libraries. Pre-hash with SHA-256 + base64, or use Argon2id.",
  "Memory use is fixed at about 4 KiB, which is why GPUs and FPGAs crack bcrypt faster than memory-hard Argon2id at equal latency.",
];

export const ARGON2_RULES = [
  "Tune in this order: memory first (as much as you can afford per concurrent login), then iterations (t) until you hit your latency target, parallelism last.",
  "Keep p = 1 unless a single login must finish faster than one core allows; extra lanes multiply CPU usage per request.",
  "Capacity check: peak concurrent logins × memory must fit in RAM. 100 simultaneous logins at 64 MiB is 6.4 GiB.",
  "The parameters are stored in each hash, so you can raise them any time and upgrade old hashes at the next successful login.",
];

export const GENERAL_RULES = [
  "Aim for roughly 100–500 ms per hash on production hardware. Benchmark there: laptops lie.",
  "Rehash on login when stored parameters are weaker than today’s policy.",
  "Rate-limit login attempts and cap the password length (for example 1,024 characters) to avoid hashing-as-DoS.",
  "Consider a pepper (a secret from an HSM or secrets manager, applied with HMAC before hashing) so a stolen database alone is not enough.",
  "Choose Argon2id when you can; bcrypt when your platform lacks it; PBKDF2 when FIPS compliance demands it.",
];
