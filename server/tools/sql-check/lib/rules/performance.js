import { COMPARISON_OPS, colName, columnRefsIn, containsAggregate, exprText, flatten, fnName, isStar, isSubquery, limitInfo, selectColumns, sourcesOf, walk } from "../ast.js";
import { byDialect } from "../dialects.js";
import { THRESHOLDS } from "./thresholds.js";

const real = (ctx) => ctx.selects.filter((s) => !s.isExists);

/** Nodes whose WHERE/ON predicates a rule should inspect: every SELECT, plus the WHERE of a top-level UPDATE/DELETE. */
const predicateScopes = (ctx) => (ctx.kind === "select" ? ctx.selects.map((s) => s.node) : [{ where: ctx.ast.where, from: [] }, ...ctx.selects.map((s) => s.node)]);
const ARITHMETIC = new Set(["+", "-", "*", "/", "%"]);

/** Does this operand compute something from a column (function, cast or arithmetic), so an index on the bare column can't be used? */
function wrapsColumn(n) {
  if (!n || typeof n !== "object") return null;
  if (n.type === "function" && columnRefsIn(n).length) return { kind: "function", name: fnName(n) };
  if (n.type === "cast" && columnRefsIn(n).length) return { kind: "cast", name: "CAST" };
  if (n.type === "binary_expr" && ARITHMETIC.has(n.operator) && columnRefsIn(n).length) return { kind: "arithmetic", name: n.operator };
  return null;
}

function nonSargableFix(wrap, dialect) {
  if (wrap.kind === "arithmetic") return "Move the arithmetic to the constant side: `col + 1 > 10` becomes `col > 9`.";
  if (wrap.kind === "cast") return "Convert the constant/parameter to the column's type instead of casting the column.";
  if (/^(LOWER|UPPER|LCASE|UCASE)$/.test(wrap.name)) {
    return byDialect(dialect, {
      postgresql: "Create an expression index: CREATE INDEX ON t (LOWER(col)); or store the column as citext.",
      mysql: "The default collations are case-insensitive, so drop LOWER()/UPPER(). Otherwise use a MySQL 8 functional index or a generated column.",
      sqlserver: "The default collation is case-insensitive, so drop LOWER()/UPPER(). Otherwise add an indexed computed column.",
      sqlite: "Declare the column COLLATE NOCASE (and index it), or create an expression index.",
    });
  }
  if (/^(DATE|YEAR|MONTH|DAY|DATEPART|DATE_TRUNC|TRUNC|CONVERT|FORMAT|STRFTIME|TO_CHAR|EXTRACT)$/.test(wrap.name)) {
    return "Compare the bare column against a range: `created_at >= '2024-05-01' AND created_at < '2024-05-02'` instead of wrapping it in a date function.";
  }
  return byDialect(dialect, {
    postgresql: "Apply the function to the constant side, or create an expression index on the exact expression.",
    mysql: "Apply the function to the constant side, or add a MySQL 8 functional index / generated column.",
    sqlserver: "Apply the function to the constant side, or add an indexed computed column.",
    sqlite: "Apply the function to the constant side, or create an expression index.",
    default: "Apply the function to the constant side, or index the expression.",
  });
}

/** Every comparison node in WHERE and JOIN conditions of a select (not descending into subqueries). */
function predicates(select) {
  const roots = [select.where, ...sourcesOf(select).map((s) => s.on)].filter(Boolean);
  const out = [];
  for (const root of roots) {
    walk(root, (n) => {
      if (isSubquery(n)) return false;
      if (n.type === "binary_expr" && COMPARISON_OPS.has(n.operator)) out.push(n);
    });
  }
  return out;
}

const randomOrderFix = (dialect) =>
  byDialect(dialect, {
    postgresql: "For one random row: pick a random id in range (WHERE id >= floor(random() * max_id) LIMIT 1). For a sample use TABLESAMPLE SYSTEM (1).",
    mysql: "Pick random ids from an indexed range in application code, or use `WHERE id >= FLOOR(RAND() * (SELECT MAX(id) FROM t)) LIMIT 1`.",
    sqlserver: "Use TABLESAMPLE (1 PERCENT), or pick a random key from an indexed range instead of sorting by NEWID().",
    sqlite: "Pick a random rowid in range: WHERE rowid >= abs(random()) % (SELECT max(rowid) FROM t) LIMIT 1.",
  });

export const performanceRules = [
  {
    id: "select-star",
    category: "performance",
    severity: "medium",
    title: "SELECT * reads every column",
    applies: ["select", "insert"],
    pass: { title: "Selects explicit columns", when: (ctx) => ctx.kind === "select" },
    run: (ctx) => {
      const hits = [];
      for (const { node, isExists } of ctx.selects) {
        if (isExists) continue;
        const star = selectColumns(node).find((c) => isStar(c.expr));
        if (!star) continue;
        const joins = sourcesOf(node).length > 1;
        hits.push({
          detail: `${star.expr.table ? `${star.expr.table}.*` : "*"} fetches every column${joins ? " from every joined table (duplicate column names collide in the result)" : ""}, including wide text/blob columns you may not need. It defeats covering indexes and breaks when columns are added or reordered.`,
          snippet: star.expr.table ? `${star.expr.table}.*` : "SELECT *",
          fix: "List only the columns the caller uses: SELECT id, name, status FROM …",
        });
      }
      return hits.slice(0, 2);
    },
  },
  {
    id: "no-where-select",
    category: "performance",
    severity: "medium",
    title: "Query reads the whole table",
    applies: ["select"],
    pass: { title: "Query is filtered or bounded", when: (ctx) => ctx.selects.length > 0 && ctx.selects.every(({ node }) => node.where || limitInfo(node).has || !sourcesOf(node).some((s) => s.kind === "table")) },
    run: (ctx) => {
      const hits = [];
      for (const { node, isExists } of ctx.selects) {
        if (isExists || !sourcesOf(node).some((s) => s.kind === "table")) continue;
        const cols = selectColumns(node);
        const aggregateOnly = cols.length > 0 && cols.every((c) => containsAggregate(c.expr)) && !node.groupby;
        if (node.where || node.groupby || limitInfo(node).has || aggregateOnly) continue;
        hits.push({
          detail: "No WHERE and no row limit: the database must read every row and send them all back. That is fine for a tiny lookup table and a problem as soon as the table grows.",
          snippet: `FROM ${sourcesOf(node).find((s) => s.kind === "table").table}`,
          fix: byDialect(ctx.dialect, {
            sqlserver: "Filter with WHERE and/or bound the result with SELECT TOP n … ORDER BY … (or OFFSET … FETCH for paging).",
            default: "Filter with WHERE and/or bound the result with LIMIT n (plus ORDER BY and paging).",
          }),
        });
      }
      return hits.slice(0, 2);
    },
  },
  {
    id: "non-sargable",
    category: "performance",
    severity: "high",
    title: "Function or arithmetic on a column prevents index use",
    applies: ["select", "update", "delete"],
    pass: { title: "Predicates can use indexes", when: (ctx) => predicateScopes(ctx).some((n) => n.where) },
    run: (ctx) => {
      const hits = [];
      for (const sel of predicateScopes(ctx)) {
        for (const p of predicates(sel)) {
          for (const side of [p.left, p.right]) {
            const wrap = wrapsColumn(side);
            if (!wrap) continue;
            hits.push({
              detail: `${exprText(side)} is computed per row, so the database cannot seek an index on the column and must scan the table to evaluate it.`,
              snippet: exprText(p),
              fix: nonSargableFix(wrap, ctx.dialect),
            });
          }
        }
      }
      return hits.slice(0, 5);
    },
  },
  {
    id: "leading-wildcard-like",
    category: "performance",
    severity: "medium",
    title: "LIKE pattern starts with a wildcard",
    applies: ["select", "update", "delete"],
    run: (ctx) => {
      const hits = [];
      for (const node of predicateScopes(ctx)) {
        for (const p of predicates(node)) {
          if (!/LIKE$/.test(p.operator) || !/^[%_]/.test(String(p.right?.value ?? ""))) continue;
          hits.push({
            detail: `${exprText(p)} cannot use a B-tree index because the match can start anywhere, so every row is checked.`,
            snippet: exprText(p),
            fix: byDialect(ctx.dialect, {
              postgresql: "Use a trigram index (CREATE EXTENSION pg_trgm; CREATE INDEX … USING gin (col gin_trgm_ops)) or full-text search.",
              mysql: "Use a FULLTEXT index with MATCH … AGAINST, or store a reversed/searchable column.",
              sqlserver: "Use Full-Text Search (CONTAINS) or a computed search column.",
              sqlite: "Use the FTS5 virtual table module.",
            }),
          });
        }
      }
      return hits.slice(0, 3);
    },
  },
  {
    id: "like-no-wildcard",
    category: "performance",
    severity: "low",
    title: "LIKE without a wildcard",
    applies: ["select", "update", "delete"],
    run: (ctx) => {
      for (const node of predicateScopes(ctx)) {
        for (const p of predicates(node)) {
          if (/^(LIKE|ILIKE)$/.test(p.operator) && typeof p.right?.value === "string" && !/[%_]/.test(p.right.value)) {
            return [{ detail: "A LIKE pattern with no % or _ is an equality test written the slow way: some engines won't use the index for it.", snippet: exprText(p), fix: "Use = instead." }];
          }
        }
      }
      return [];
    },
  },
  {
    id: "or-different-columns",
    category: "performance",
    severity: "medium",
    title: "OR across different columns",
    applies: ["select", "update", "delete"],
    run: (ctx) => {
      const hits = [];
      for (const where of new Set(predicateScopes(ctx).map((n) => n.where))) {
        if (!where) continue;
        walk(where, (n, ancestors) => {
          if (isSubquery(n)) return false;
          const parent = ancestors[ancestors.length - 1];
          if (n.type !== "binary_expr" || n.operator !== "OR" || (parent?.type === "binary_expr" && parent.operator === "OR")) return;
          const sets = flatten(n, "OR").map((leaf) => new Set(columnRefsIn(leaf).map((c) => colName(c).toLowerCase())));
          const all = new Set(sets.flatMap((s) => [...s]));
          if (all.size > 1) {
            hits.push({
              detail: `The OR spans ${[...all].slice(0, 4).join(", ")}. One index cannot serve conditions on different columns, so the engine either scans the table or has to merge several index lookups.`,
              snippet: exprText(n),
              fix: "Rewrite as UNION ALL of two queries that each use one index (add a NOT/IS DISTINCT guard to avoid duplicates), or make sure each column has its own index so the optimiser can merge them.",
            });
          } else if (all.size === 1 && sets.length > 1) {
            hits.push({
              id: "or-same-column",
              severity: "low",
              title: "Several ORs on one column",
              detail: `${[...all][0]} is compared with OR ${sets.length} times.`,
              snippet: exprText(n),
              fix: `Write it as ${[...all][0]} IN (…), which is shorter and easier for the optimiser.`,
            });
          }
        });
      }
      return hits.slice(0, 3);
    },
  },
  {
    id: "large-in-list",
    category: "performance",
    severity: "medium",
    title: "Very long IN list",
    applies: ["select", "update", "delete"],
    run: (ctx) => {
      const hits = [];
      walk(ctx.ast, (n) => {
        if (n.type === "binary_expr" && /IN$/.test(n.operator) && n.right?.type === "expr_list" && n.right.value?.length > THRESHOLDS.inList && !n.right.value.some(isSubquery)) {
          hits.push({
            detail: `This IN list has ${n.right.value.length} values. Big lists are slow to parse and plan, and some databases cap their size (SQL Server and Oracle degrade or fail well before a few thousand).`,
            snippet: `${exprText(n.left)} IN (${n.right.value.length} values)`,
            fix: byDialect(ctx.dialect, {
              postgresql: "Pass an array: WHERE id = ANY($1), or JOIN against a VALUES list / temporary table.",
              sqlserver: "Use a table-valued parameter or a temp table and JOIN to it.",
              default: "Load the values into a temporary table and JOIN to it.",
            }),
          });
        }
      });
      return hits.slice(0, 1);
    },
  },
  {
    id: "deep-offset",
    category: "performance",
    severity: "medium",
    title: "Large OFFSET",
    applies: ["select"],
    run: (ctx) => {
      for (const { node } of ctx.selects) {
        const { offset } = limitInfo(node);
        if (offset !== null && offset >= THRESHOLDS.deepOffset) {
          return [
            {
              detail: `OFFSET ${offset.toLocaleString("en-US")} makes the database read and throw away ${offset.toLocaleString("en-US")} rows before returning the page, so later pages get slower and slower.`,
              snippet: `OFFSET ${offset}`,
              fix: "Use keyset (seek) pagination: remember the last row's sort key and ask for the next page with WHERE (created_at, id) < (:last_created_at, :last_id) ORDER BY created_at DESC, id DESC LIMIT 50.",
            },
          ];
        }
      }
      return [];
    },
  },
  {
    id: "order-by-random",
    category: "performance",
    severity: "high",
    title: "ORDER BY random",
    applies: ["select"],
    run: (ctx) => {
      for (const { node } of real(ctx)) {
        const fn = (node.orderby ?? []).map((o) => fnName(o.expr)).find((n) => ["RAND", "RANDOM", "NEWID"].includes(n));
        if (fn) {
          return [
            {
              detail: `ORDER BY ${fn}() assigns a random number to every row and sorts them all, even if you only want one.`,
              snippet: `ORDER BY ${fn}()`,
              fix: randomOrderFix(ctx.dialect),
            },
          ];
        }
      }
      return [];
    },
  },
  {
    id: "select-list-subquery",
    category: "performance",
    severity: "medium",
    title: "Subquery in the SELECT list",
    applies: ["select"],
    run: (ctx) => {
      for (const { node } of real(ctx)) {
        for (const c of selectColumns(node)) {
          if (!isSubquery(c.expr)) continue;
          const inner = c.expr.ast;
          const own = new Set(sourcesOf(inner).flatMap((s) => [s.name?.toLowerCase(), s.table?.toLowerCase()]).filter(Boolean));
          const refs = [inner.where, ...sourcesOf(inner).map((s) => s.on)].flatMap((e) => (e ? columnRefsIn(e) : []));
          const correlated = refs.some((r) => r.table && !own.has(String(r.table).toLowerCase()));
          return [
            {
              severity: correlated ? "medium" : "low",
              detail: correlated
                ? "This correlated subquery runs once for every row of the outer query (an N+1 inside the database)."
                : "A scalar subquery in the select list is evaluated for each row unless the optimiser can hoist it.",
              snippet: `(SELECT …)${c.alias ? ` AS ${c.alias}` : ""}`,
              fix: byDialect(ctx.dialect, {
                postgresql: "Rewrite as a LEFT JOIN … GROUP BY, a window function, or a LATERAL join.",
                sqlserver: "Rewrite as a LEFT JOIN … GROUP BY, a window function, or OUTER APPLY.",
                default: "Rewrite as a LEFT JOIN … GROUP BY or a window function.",
              }),
            },
          ];
        }
      }
      return [];
    },
  },
  {
    id: "many-joins",
    category: "performance",
    severity: "low",
    title: "Many joins in one query",
    applies: ["select"],
    run: (ctx) => {
      for (const { node } of real(ctx)) {
        const joins = sourcesOf(node).filter((s) => s.join).length;
        if (joins > THRESHOLDS.joins) {
          return [
            {
              detail: `${joins} joins in one query make plans hard to optimise and results easy to multiply by accident.`,
              snippet: `${joins} JOINs`,
              fix: "Split into steps (CTEs or temporary results), pre-aggregate before joining, or denormalise the hot read path.",
            },
          ];
        }
      }
      return [];
    },
  },
  {
    id: "select-distinct-join",
    category: "performance",
    severity: "low",
    title: "DISTINCT on a join",
    applies: ["select"],
    run: (ctx) => {
      for (const { node } of real(ctx)) {
        const distinct = node.distinct === "DISTINCT" || node.distinct?.type === "DISTINCT";
        if (distinct && sourcesOf(node).length > 1) {
          return [
            {
              detail: "DISTINCT over a join often hides duplicate rows created by a one-to-many relationship, and it forces a sort or hash of the whole result.",
              snippet: "SELECT DISTINCT … JOIN …",
              fix: "If you only need parent rows that have a match, use WHERE EXISTS (SELECT 1 FROM child …) instead of joining and de-duplicating.",
            },
          ];
        }
      }
      return [];
    },
  },
  {
    id: "negation-predicate",
    category: "performance",
    severity: "info",
    title: "Negated condition",
    applies: ["select", "update", "delete"],
    run: (ctx) => {
      const found = [];
      for (const node of predicateScopes(ctx)) {
        for (const p of predicates(node)) {
          const negated = ["<>", "!=", "NOT LIKE", "NOT ILIKE"].includes(p.operator) || (p.operator === "NOT IN" && !p.right?.value?.some?.(isSubquery));
          if (negated && columnRefsIn(p.left).length && !wrapsColumn(p.left)) found.push(exprText(p));
        }
      }
      if (!found.length) return [];
      return [
        {
          detail: "Conditions that say what a row is not (<>, NOT IN, NOT LIKE) usually match most of the table, so an index rarely helps and the engine scans.",
          snippet: found.slice(0, 2).join("; "),
          fix: "If the allowed values are a small known set, list them with IN; otherwise combine the condition with a selective positive filter.",
        },
      ];
    },
  },
];
