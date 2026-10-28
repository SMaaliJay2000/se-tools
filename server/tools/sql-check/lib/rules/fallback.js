import { stripLiteralsAndComments } from "../split.js";

/**
 * When a statement can't be parsed, the two checks that matter most still work on the raw text:
 * UPDATE/DELETE without WHERE, and SELECT *. Marked as such, since they are keyword matches, not a parse.
 */
export function fallbackFindings(text) {
  const t = stripLiteralsAndComments(text);
  const out = [];
  const note = " (found by keyword match because the statement could not be parsed)";
  if (/^\s*update\b/i.test(t) && !/\bwhere\b/i.test(t)) {
    out.push({
      id: "update-no-where",
      category: "safety",
      severity: "critical",
      title: "UPDATE without WHERE changes every row",
      detail: `This UPDATE has no WHERE clause, so it would rewrite every row${note}.`,
      fix: "Add a WHERE that targets exactly the rows you mean, and run the matching SELECT first.",
    });
  }
  if (/^\s*delete\b/i.test(t) && !/\bwhere\b/i.test(t)) {
    out.push({
      id: "delete-no-where",
      category: "safety",
      severity: "critical",
      title: "DELETE without WHERE removes every row",
      detail: `This DELETE has no WHERE clause, so it would remove every row${note}.`,
      fix: "Add a WHERE that targets exactly the rows you mean, or use TRUNCATE TABLE if you really want to empty the table.",
    });
  }
  if (/^\s*select\b[\s\S]*?(?<![\w)(])\*\s*(?:,|\bfrom\b)/i.test(t)) {
    out.push({
      id: "select-star",
      category: "performance",
      severity: "medium",
      title: "SELECT * reads every column",
      detail: `The query selects every column${note}.`,
      fix: "List only the columns the caller uses.",
    });
  }
  return out;
}
