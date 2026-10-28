// Mirrors the payloads in server/tools/sql-check/routes.js and lib/analyze.js. Hand-synced, like the other tools.
import type { Score, Severity } from "@/lib/severity";

export type Category = "safety" | "correctness" | "performance" | "schema";

export const CATEGORY_LABEL: Record<Category, string> = {
  safety: "Safety",
  correctness: "Correctness",
  performance: "Performance",
  schema: "Schema",
};

export interface SqlFinding {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  detail: string;
  snippet?: string;
  fix?: string;
  /** Index of the statement this finding belongs to. */
  statement: number;
  /** 1-based line where that statement starts. */
  line: number;
}

/** A Score plus the plain-language optimization level ("Well optimized", "Dangerous", ...). */
export interface LevelScore extends Score {
  level: string;
}

export interface ParseError {
  kind: "syntax" | "insert-count-mismatch";
  message: string;
  line: number | null;
  column: number | null;
}

export interface StatementResult {
  index: number;
  line: number;
  /** The statement text, truncated to 600 characters. */
  sql: string;
  kind: string;
  /** False for DDL such as CREATE TABLE, which is parsed but has nothing to optimize. */
  analyzed: boolean;
  parsed: boolean;
  parseError?: ParseError;
  findings: SqlFinding[];
  score: LevelScore;
}

export interface AnalyzeResult {
  dialect: string;
  durationMs: number;
  statements: StatementResult[];
  findings: SqlFinding[];
  score: LevelScore;
  schema: { tables: number; indexes: number; notices: string[] } | null;
}

export interface Dialect {
  id: string;
  label: string;
}

export interface Options {
  dialects: Dialect[];
  limits: { maxSqlChars: number; maxSchemaChars: number; maxStatements: number; maxStatementChars: number };
}
