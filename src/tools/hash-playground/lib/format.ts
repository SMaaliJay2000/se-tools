export function formatMs(ms: number): string {
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export function formatMemory(kib: number): string {
  return kib >= 1024 ? `${+(kib / 1024).toFixed(1)} MiB` : `${kib} KiB`;
}

/** Human label for a parameter value, e.g. memoryKb=19456 -> "19 MiB". */
export function formatParam(name: string, value: number): string {
  if (name === "memoryKb") return formatMemory(value);
  if (name === "iterations" && value >= 1000) return formatCount(value);
  return String(value);
}

export function utf8ToBase64(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s));
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

export function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** Flips one bit of the first byte: the smallest possible "attacker modification". */
export function flipFirstBit(b64: string): string {
  const bytes = base64ToBytes(b64);
  if (bytes.length === 0) return b64;
  bytes[0] ^= 1;
  return bytesToBase64(bytes);
}

export function hexToBytes(hex: string): number[] {
  return (hex.match(/../g) ?? []).map((h) => parseInt(h, 16));
}

/** Number of byte positions that differ between two equal-purpose values (extra length counts as differing). */
export function diffCount(a: string, b: string): number {
  const x = hexToBytes(a);
  const y = hexToBytes(b);
  let n = Math.abs(x.length - y.length);
  for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) n++;
  return n;
}

/** Remembered UI preference; storage can be unavailable (private mode), so never throw. */
export function loadPref(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function savePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}
