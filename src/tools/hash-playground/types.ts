// Mirrors the payloads in server/tools/hash-playground/routes.js. Hand-synced, like the other tools.

export type Encoding = "utf8" | "hex" | "base64";

export interface Bytes {
  hex: string;
  base64: string;
  length: number;
}

export interface ParameterSpec {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  unit: string;
  hint: string;
}

export interface PasswordAlgorithm {
  id: string;
  displayName: string;
  description: string;
  formatExample: string;
  costParameter: string;
  parameters: ParameterSpec[];
}

export interface Catalog {
  digests: string[];
  hmacs: string[];
  passwords: PasswordAlgorithm[];
  aesGcm: { keyBits: number[]; ivBytes: number; tagBytes: number };
  benchmark: { maxPoints: number; maxRepeats: number };
}

export interface DigestResponse {
  algorithm: string;
  inputLength: number;
  digest: Bytes;
}

export interface HmacResponse {
  algorithm: string;
  mac: Bytes;
}

export type Params = Record<string, number>;

export interface PasswordHashResponse {
  algorithm: string;
  encoded: string;
  salt: Bytes;
  hash: Bytes;
  parameters: Params;
  elapsedMs: number;
  warnings: string[];
}

export interface PasswordVerifyResponse {
  valid: boolean;
  algorithm: string;
  parameters: Params;
  elapsedMs: number;
}

export interface AesGcmEncryptResponse {
  key: Bytes;
  iv: Bytes;
  ciphertext: Bytes;
  tag: Bytes;
  combined: Bytes;
  warnings: string[];
}

export interface AesGcmDecryptResponse {
  text: string | null;
  plaintext: Bytes;
}

export interface BenchmarkResponse {
  algorithm: string;
  parameter: string;
  points: { value: number; elapsedMs: number }[];
  truncated: boolean;
}

export interface TuningRecommendation {
  algorithm: string;
  parameters: Params;
  measuredMs: number;
  note: string;
}
