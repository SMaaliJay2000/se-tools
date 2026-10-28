import type {
  AesGcmDecryptResponse,
  AesGcmEncryptResponse,
  BenchmarkResponse,
  Catalog,
  DigestResponse,
  Encoding,
  HmacResponse,
  Params,
  PasswordHashResponse,
  PasswordVerifyResponse,
  TuningRecommendation,
} from "./types";

const BASE = "/api/hash-playground";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("Can't reach the API. Check your connection and try again.");
  }
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as { error?: string; code?: string } | null;
    if (problem?.error) throw new ApiError(problem.error, problem.code);
    if (res.status === 504) throw new ApiError("The request timed out.");
    throw new ApiError(`The API returned an error (${res.status}).`);
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body: unknown) => request<T>("POST", path, body);

export const api = {
  algorithms: () => request<Catalog>("GET", "/algorithms"),

  digest: (body: { algorithm: string; input: string; inputEncoding: Encoding }) => post<DigestResponse>("/digest", body),

  hmac: (body: { algorithm: string; key: string; keyEncoding: Encoding; message: string; messageEncoding: Encoding }) => post<HmacResponse>("/hmac", body),

  hashPassword: (body: { algorithm: string; password: string; parameters: Params }) => post<PasswordHashResponse>("/password/hash", body),

  verifyPassword: (body: { password: string; encoded: string }) => post<PasswordVerifyResponse>("/password/verify", body),

  encrypt: (body: { plaintext: string; key?: string; iv?: string; aad?: string }) => post<AesGcmEncryptResponse>("/aes-gcm/encrypt", body),

  decrypt: (body: { key: string; iv: string; ciphertext: string; tag: string; aad?: string }) => post<AesGcmDecryptResponse>("/aes-gcm/decrypt", body),

  benchmark: (body: { algorithm: string; parameter: string; values: number[]; fixed?: Params; repeats: number }) => post<BenchmarkResponse>("/benchmark", body),

  recommend: (body: { targetMs: number; argon2MemoryKb: number }) => post<TuningRecommendation[]>("/tuning/recommend", body),
};
