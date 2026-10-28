import { byDialect } from "../dialects.js";
import { exprText } from "../ast.js";

const LITERAL_TYPES = new Set(["number", "single_quote_string", "string", "bool"]);

/** WHERE 1 = 1, WHERE TRUE, WHERE 'a' = 'a', or any of those OR-ed in: filters nothing. */
export function isTautology(e) {
  if (!e) return false;
  if (e.type === "bool") return e.value === true || e.value === "true" || e.value === "TRUE";
  if (e.type !== "binary_expr") return false;
  if (e.operator === "OR") return isTautology(e.left) || isTautology(e.right);
  if (e.operator === "AND") return isTautology(e.left) && isTautology(e.right);
  return e.operator === "=" && LITERAL_TYPES.has(e.left?.type) && e.left.type === e.right?.type && e.left.value === e.right.value;
}

const preview = (dialect, verb) =>
  byDialect(dialect, {
    mysql: `Run the matching SELECT first and check the row count. Inside a transaction, ${verb} with a WHERE, verify the affected rows, then COMMIT. MySQL's --safe-updates (sql_safe_updates=1) refuses statements like this.`,
    default: `Run the matching SELECT first and check the row count. Inside a transaction (BEGIN; ... COMMIT;), ${verb} with a WHERE, verify the affected rows, then commit.`,
  });

export const safetyRules = [
  {
    id: "update-no-where",
    category: "safety",
    severity: "critical",
    title: "UPDATE without WHERE changes every row",
    applies: ["update"],
    pass: { title: "UPDATE has a WHERE clause", when: () => true },
    run: ({ ast, dialect }) =>
      ast.where
        ? []
        : [
            {
              detail: "Without a WHERE clause this statement rewrites every row in the table. It is the most common cause of accidental data loss.",
              snippet: "UPDATE … (no WHERE)",
              fix: `Add a WHERE that targets exactly the rows you mean, e.g.\nUPDATE accounts SET status = 'closed' WHERE id = 42;\n\n${preview(dialect, "run the UPDATE")}`,
            },
          ],
  },
  {
    id: "delete-no-where",
    category: "safety",
    severity: "critical",
    title: "DELETE without WHERE removes every row",
    applies: ["delete"],
    pass: { title: "DELETE has a WHERE clause", when: () => true },
    run: ({ ast, dialect }) =>
      ast.where
        ? []
        : [
            {
              detail: "Without a WHERE clause this statement deletes every row in the table (and, unlike TRUNCATE, does so row by row and logs each one).",
              snippet: "DELETE FROM … (no WHERE)",
              fix: `Add a WHERE that targets exactly the rows you mean, e.g.\nDELETE FROM sessions WHERE expires_at < NOW();\n\nIf you really want to empty the table, say so with TRUNCATE TABLE (faster, but it resets identity counters and can't be rolled back on some engines).\n\n${preview(dialect, "run the DELETE")}`,
            },
          ],
  },
  {
    id: "where-tautology",
    category: "safety",
    severity: "critical",
    title: "WHERE condition is always true",
    applies: ["update", "delete"],
    run: ({ ast }) =>
      ast.where && isTautology(ast.where)
        ? [
            {
              detail: "This WHERE clause is always true, so the statement still affects every row. It usually comes from query-building code that starts with `WHERE 1=1` and then forgets to add conditions.",
              snippet: exprText(ast.where),
              fix: "Make sure at least one real condition is always applied, or fail the request in application code when no filter was supplied.",
            },
          ]
        : [],
  },
  {
    id: "destructive-ddl",
    category: "safety",
    severity: "high",
    title: "Destructive statement",
    applies: ["drop", "truncate"],
    run: ({ ast, dialect }) => [
      {
        detail: `${ast.type === "drop" ? `DROP ${String(ast.keyword ?? "").toUpperCase()}` : "TRUNCATE"} permanently removes data or structure and ${
          dialect === "mysql" ? "cannot be rolled back (MySQL commits DDL implicitly)" : dialect === "sqlite" ? "cannot be undone once committed" : "is hard to undo once committed"
        }.`,
        snippet: ast.type === "drop" ? `DROP ${String(ast.keyword ?? "").toUpperCase()}` : "TRUNCATE TABLE",
        fix: "Take a backup or snapshot first, run it against a copy, and keep destructive statements out of application code paths. Prefer renaming (ALTER … RENAME) and dropping later.",
      },
    ],
  },
];
