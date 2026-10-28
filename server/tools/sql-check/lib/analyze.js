import { selectsIn, walk } from "./ast.js";
import { DIALECT_IDS, LIMITS } from "./dialects.js";
import { SqlCheckError } from "./errors.js";
import { guessDialect, kindOf, parseStatement } from "./parse.js";
import { fallbackFindings } from "./rules/fallback.js";
import { runRules } from "./rules/index.js";
import { buildSchema } from "./schema.js";
import { scoreOverall, scoreStatement } from "./score.js";
import { splitStatements } from "./split.js";

// Statements of these kinds are checked by rules; DDL like CREATE/ALTER is parsed but has nothing to optimize.
const ANALYZED = new Set(["select", "insert", "update", "delete", "drop", "truncate"]);

const excerpt = (text) => (text.length > 600 ? `${text.slice(0, 600)}…` : text);

function cteNamesOf(ast) {
  const names = new Set();
  walk(ast, (n) => {
    if (Array.isArray(n.with)) for (const c of n.with) if (c?.name?.value) names.add(String(c.name.value).toLowerCase());
  });
  return names;
}

function syntaxFinding(error, text, dialect) {
  if (error.kind === "insert-count-mismatch") {
    return {
      id: "insert-count-mismatch",
      category: "correctness",
      severity: "high",
      title: "INSERT column count does not match value count",
      detail: `${error.message}. The database will reject this statement.`,
      fix: "Make the number of values in every row equal to the number of listed columns (or to the table's column count when no column list is given).",
    };
  }
  const other = guessDialect(text, dialect);
  const where = error.line ? ` (line ${error.line}, column ${error.column})` : "";
  return {
    id: "syntax-error",
    category: "correctness",
    severity: "high",
    title: "SQL syntax error",
    detail: `${error.message}${where}. ${other ? `This parses as ${other}: check the dialect selector.` : "If the statement is valid for your database, it may use syntax this analyzer doesn't support yet."}`,
    fix: "Check keywords, commas, parentheses and quotes near the reported position.",
  };
}

function analyzeStatement(stmt, index, dialect, schema) {
  const base = { index, line: stmt.line, sql: excerpt(stmt.text) };

  if (stmt.text.length > LIMITS.maxStatementChars) {
    const findings = [
      {
        id: "statement-too-long",
        category: "correctness",
        severity: "info",
        title: "Statement too long to analyze",
        detail: `This statement is ${stmt.text.length.toLocaleString("en-US")} characters; the limit is ${LIMITS.maxStatementChars.toLocaleString("en-US")}.`,
        fix: "Analyze it in smaller pieces.",
      },
    ];
    return { ...base, kind: "unknown", analyzed: false, parsed: false, findings: tag(findings, index, stmt.line), score: scoreStatement(findings) };
  }

  const { ast, error } = parseStatement(stmt.text, dialect);
  if (error) {
    const findings = [syntaxFinding(error, stmt.text, dialect), ...fallbackFindings(stmt.text)];
    return { ...base, kind: "unknown", analyzed: true, parsed: false, parseError: error, findings: tag(findings, index, stmt.line), score: scoreStatement(findings, { parsed: false }) };
  }

  const kind = kindOf(ast);
  const ctx = { ast, kind, dialect, text: stmt.text, schema, selects: selectsIn(ast), cteNames: cteNamesOf(ast) };
  const findings = ANALYZED.has(kind) ? runRules(ctx) : [];
  return { ...base, kind, analyzed: ANALYZED.has(kind), parsed: true, findings: tag(findings, index, stmt.line), score: scoreStatement(findings) };
}

const tag = (findings, statement, line) => findings.map((f) => ({ ...f, statement, line }));

/** Analyzes a SQL script. Throws SqlCheckError for bad requests; syntax problems in the SQL itself are results, not errors. */
export function analyzeSql({ sql, dialect, schema: schemaText }) {
  const started = performance.now();
  if (!DIALECT_IDS.includes(dialect)) throw new SqlCheckError("unknown_dialect", `Unknown dialect '${dialect}'. Supported: ${DIALECT_IDS.join(", ")}.`);

  const parts = splitStatements(sql, dialect);
  if (parts.length === 0) throw new SqlCheckError("empty_sql", "There is no SQL to analyze: the input is empty or only comments.");
  if (parts.length > LIMITS.maxStatements) throw new SqlCheckError("too_many_statements", `Too many statements (${parts.length}). Analyze at most ${LIMITS.maxStatements} at a time.`);

  const schema = schemaText?.trim() ? buildSchema(schemaText, dialect) : null;
  const statements = parts.map((p, i) => analyzeStatement(p, i, dialect, schema && schema.tables.size ? schema : null));
  const analyzed = statements.filter((s) => s.analyzed);

  return {
    dialect,
    durationMs: Math.round(performance.now() - started),
    statements,
    findings: statements.flatMap((s) => s.findings),
    score: scoreOverall(analyzed.map((s) => s.score)),
    schema: schema ? { tables: schema.tables.size, indexes: schema.indexCount, notices: schema.notices } : null,
  };
}
