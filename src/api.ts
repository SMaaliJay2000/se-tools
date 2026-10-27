import type { ScanResult } from "./types";

export async function scan(url: string, origin?: string, signal?: AbortSignal): Promise<ScanResult> {
  let res: Response;
  try {
    res = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url, origin: origin || undefined }),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new Error("Can't reach the analyzer API. Check your connection and try again.");
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON error page, e.g. a platform timeout */
  }
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error;
    if (msg) throw new Error(msg);
    if (res.status === 504) throw new Error("The scan timed out. The target may be too slow to respond.");
    throw new Error(`The analyzer returned an error (${res.status}).`);
  }
  return data as ScanResult;
}
