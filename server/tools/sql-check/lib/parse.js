import { createRequire } from "node:module";
import { DIALECT_IDS } from "./dialects.js";

const require = createRequire(import.meta.url);

// Literal require() paths on purpose: Vercel's bundler only ships files it can see statically.
const loaders = {
  postgresql: () => require("node-sql-parser/build/postgresql"),
  mysql: () => require("node-sql-parser/build/mysql"),
  sqlserver: () => require("node-sql-parser/build/transactsql"),
  sqlite: () => require("node-sql-parser/build/sqlite"),
};

const parsers = new Map();
function parserFor(dialect) {
  if (!parsers.has(dialect)) parsers.set(dialect, new (loaders[dialect]().Parser)());
  return parsers.get(dialect);
}

/**
 * Parses one statement. Returns { ast } or { error: { kind, message, line, column } }.
 * `kind` is "syntax" for grammar errors and "insert-count-mismatch" for the one semantic error the parser raises itself.
 */
export function parseStatement(text, dialect) {
  try {
    let ast = parserFor(dialect).astify(text);
    if (Array.isArray(ast)) ast = ast[0];
    return { ast };
  } catch (e) {
    return { error: describeError(e) };
  }
}

function describeError(e) {
  const message = String(e?.message ?? e);
  if (/column count doesn't match value count/i.test(message)) {
    return { kind: "insert-count-mismatch", message: message.replace(/^Error:\s*/, ""), line: null, column: null };
  }
  const start = e?.location?.start;
  const found = typeof e?.found === "string" ? e.found : null;
  return {
    kind: "syntax",
    message: found ? `Unexpected ${JSON.stringify(found)}` : message.replace(/^Error:\s*/, "").slice(0, 160),
    line: start?.line ?? null,
    column: start?.column ?? null,
  };
}

/** If `text` fails under `dialect`, finds another supported dialect that parses it (to say "this looks like SQL Server syntax"). */
export function guessDialect(text, dialect) {
  // The T-SQL grammar is lenient (it swallows plain nonsense as a procedure call), so only trust a match that is a real statement.
  return DIALECT_IDS.find((id) => {
    if (id === dialect) return false;
    const { ast, error } = parseStatement(text, id);
    return !error && kindOf(ast) !== "other" && kindOf(ast) !== "unknown";
  }) ?? null;
}

/** High-level statement kind, used for display and to scope rules. */
export function kindOf(ast) {
  const t = ast?.type;
  if (!t) return "unknown";
  return ["select", "insert", "update", "delete", "create", "alter", "drop", "truncate"].includes(t) ? t : "other";
}
