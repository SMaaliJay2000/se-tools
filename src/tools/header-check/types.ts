import type { Score, Severity } from "@/lib/severity";

export type { Severity };
export { SEVERITIES, SEVERITY_LABEL } from "@/lib/severity";

export type Category = "transport" | "headers" | "cookies" | "cors" | "disclosure";

export interface Fix {
  express: string;
  aspnet: string;
  nginx: string;
  iis: string;
}

export interface Finding {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  detail: string;
  header?: string;
  value?: string;
  fix?: Fix;
}

export interface CorsProbe {
  key: string;
  label: string;
  origin: string;
  method: string;
  status: number | null;
  acao: string | null;
  acac: string | null;
  vary: string | null;
  methods: string | null;
  allowHeaders: string | null;
  maxAge: string | null;
  error: string | null;
}

export interface Tls {
  protocol: string | null;
  subject: string | null;
  issuer: string | null;
  validTo: string | null;
  daysLeft: number | null;
}

export interface ScanResult {
  url: string;
  finalUrl: string;
  status: number;
  statusText: string;
  scannedAt: string;
  durationMs: number;
  chain: { url: string; status: number; location: string | null }[];
  headers: [string, string][];
  tls: Tls | null;
  tlsError: string | null;
  findings: Finding[];
  score: Score;
  cors: { probes: CorsProbe[]; testOrigin: string | null };
}

export const CATEGORY_LABEL: Record<Category, string> = {
  transport: "HTTPS",
  headers: "Headers",
  cookies: "Cookies",
  cors: "CORS",
  disclosure: "Disclosure",
};
