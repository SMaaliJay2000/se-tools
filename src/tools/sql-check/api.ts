import type { AnalyzeResult, Options } from "./types";

const BASE = "/api/sql-check";

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error("Can't reach the API. Check your connection and try again.");
  }
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as { error?: string } | null;
    if (problem?.error) throw new Error(problem.error);
    if (res.status === 504) throw new Error("The analysis timed out.");
    throw new Error(`The API returned an error (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  options: () => request<Options>("GET", "/options"),
  analyze: (body: { sql: string; dialect: string; schema?: string }) => request<AnalyzeResult>("POST", "/analyze", body),
};
