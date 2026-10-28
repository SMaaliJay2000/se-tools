import { colName, columnRefsIn, containsAggregate, exprText, flatten, isColumn, isParamName, isStar, isSubquery, limitInfo, selectColumns, sourcesOf, walk } from "../ast.js";
import { byDialect } from "../dialects.js";
import { isTautology } from "./safety.js";

const real = (ctx) => ctx.selects.filter((s) => !s.isExists);

/** Does an AND-leaf compare a column of one source with a column of a different source (a join predicate)? */
function isJoinPredicate(leaf) {
  if (leaf.type !== "binary_expr" || leaf.operator !== "=") return false;
  const [l, r] = [leaf.left, leaf.right];
  if (!isColumn(l) || !isColumn(r)) return false;
  return !l.table || !r.table || l.table !== r.table;
}

export const correctnessRules = [
  {
    id: "cartesian-join",
    category: "correctness",
    severity: "high",
    title: "Join without a join condition",
    applies: ["select", "update", "delete", "insert"],
    pass: { title: "Every join has a condition", when: (ctx) => ctx.selects.some((s) => sourcesOf(s.node).length > 1) },
    run: (ctx) => {
      const hits = [];
      for (const { node } of ctx.selects) {
        const sources = sourcesOf(node);
        if (sources.length < 2) continue;
        const leaves = flatten(node.where, "AND");
        for (const s of sources.slice(1)) {
          if (s.join && !/CROSS/i.test(s.join) && !s.on && !s.using) {
            hits.push({
              detail: `${s.join} ${s.name} has no ON or USING condition, so every row on the left is paired with every row of ${s.name} (rows multiply instead of matching).`,
              snippet: `${s.join} ${s.table ?? s.name}`,
              fix: `Add the relationship, e.g. ${s.join} ${s.table ?? s.name} ON ${s.name}.parent_id = parent.id. If you really want every combination, write CROSS JOIN so the intent is visible.`,
            });
          } else if (s.join && s.on && isTautology(s.on)) {
            hits.push({
              detail: `The ON condition of ${s.name} is always true, which is a cross join in disguise.`,
              snippet: exprText(s.on),
              fix: "Join on the key that relates the two tables.",
            });
          } else if (!s.join && !leaves.some(isJoinPredicate)) {
            hits.push({
              detail: `${s.name} is listed in FROM with a comma, and nothing in WHERE relates it to the other tables, so the result is a Cartesian product.`,
              snippet: `FROM … , ${s.table ?? s.name}`,
              fix: "Use an explicit JOIN … ON …, which makes a missing condition a syntax error instead of a silent row explosion.",
            });
          }
        }
      }
      return hits;
    },
  },
  {
    id: "implicit-join",
    category: "correctness",
    severity: "low",
    title: "Comma-separated FROM (implicit join)",
    applies: ["select", "update", "delete"],
    run: (ctx) => {
      const flagged = ctx.selects.find(({ node }) => sourcesOf(node).slice(1).some((s) => !s.join));
      if (!flagged) return [];
      // A missing condition is already reported by cartesian-join; only flag the style when conditions exist.
      const leaves = flatten(flagged.node.where, "AND");
      if (!leaves.some(isJoinPredicate)) return [];
      return [
        {
          detail: "Tables joined with commas and a WHERE predicate work, but the join condition is mixed in with the filters, and forgetting it silently produces a Cartesian product.",
          snippet: "FROM a, b WHERE a.id = b.a_id",
          fix: "Write FROM a JOIN b ON a.id = b.a_id and keep WHERE for filtering only.",
        },
      ];
    },
  },
  {
    id: "null-comparison",
    category: "correctness",
    severity: "high",
    title: "Comparison with NULL using = or <>",
    applies: ["select", "update", "delete", "insert"],
    run: (ctx) => {
      const hits = [];
      walk(ctx.ast, (n) => {
        if (n.type === "binary_expr" && ["=", "<>", "!=", "<", ">", "<=", ">="].includes(n.operator) && (n.left?.type === "null" || n.right?.type === "null")) {
          const negated = n.operator === "<>" || n.operator === "!=";
          hits.push({
            detail: `${exprText(n)} is never true: any comparison with NULL yields UNKNOWN, so the row is filtered out ${negated ? "even when the value is set" : "even when the value is NULL"}.`,
            snippet: exprText(n),
            fix: negated ? "Use IS NOT NULL." : "Use IS NULL.",
          });
        }
      });
      return hits.slice(0, 3);
    },
  },
  {
    id: "not-in-subquery",
    category: "correctness",
    severity: "medium",
    title: "NOT IN with a subquery",
    applies: ["select", "update", "delete"],
    run: (ctx) => {
      const hits = [];
      walk(ctx.ast, (n) => {
        if (n.type === "binary_expr" && n.operator === "NOT IN" && n.right?.type === "expr_list" && n.right.value?.some(isSubquery)) {
          hits.push({
            detail: "If the subquery returns even one NULL, `NOT IN` matches nothing at all, a silent wrong answer. It also tends to optimise worse than an anti-join.",
            snippet: `${exprText(n.left)} NOT IN (SELECT …)`,
            fix: `Use NOT EXISTS:\nWHERE NOT EXISTS (SELECT 1 FROM other o WHERE o.key = t.key)`,
          });
        }
      });
      return hits.slice(0, 2);
    },
  },
  {
    id: "insert-no-columns",
    category: "correctness",
    severity: "medium",
    title: "INSERT without a column list",
    applies: ["insert"],
    pass: { title: "INSERT lists its columns", when: () => true },
    run: ({ ast }) =>
      !ast.columns && ast.values
        ? [
            {
              detail: "Values are matched to columns by position. Adding, removing or reordering a column later will silently put data in the wrong place or break the statement.",
              snippet: "INSERT INTO t VALUES (…)",
              fix: "Name the columns: INSERT INTO t (id, name, created_at) VALUES (…).",
            },
          ]
        : [],
  },
  {
    id: "group-by-nonaggregated",
    category: "correctness",
    severity: "high",
    title: "Selected column is neither grouped nor aggregated",
    applies: ["select"],
    run: (ctx) => {
      const hits = [];
      for (const { node, isExists } of real(ctx)) {
        if (isExists) continue;
        const cols = selectColumns(node);
        const hasAgg = cols.some((c) => containsAggregate(c.expr));
        const g = node.groupby;
        const groupCols = Array.isArray(g) ? g : (g?.columns ?? []);
        if (!hasAgg && groupCols.length === 0) continue;
        if (groupCols.some((x) => x.type !== "column_ref")) continue; // expressions/ordinals: can't compare reliably
        const plain = cols.map((c) => c.expr).filter((e) => isColumn(e) && !isParamName(colName(e)));
        const missing = plain.filter((p) => !groupCols.some((x) => colName(x) === colName(p) && (!x.table || !p.table || x.table === p.table)));
        if (missing.length === 0 || (groupCols.length === 0 && !hasAgg)) continue;
        const names = [...new Set(missing.map(exprText))].slice(0, 4).join(", ");
        const lenient = ctx.dialect === "mysql" || ctx.dialect === "sqlite";
        hits.push({
          severity: lenient ? "medium" : "high",
          detail: `${names} ${missing.length > 1 ? "are" : "is"} selected next to ${groupCols.length ? "GROUP BY" : "an aggregate"} but ${groupCols.length ? "not listed in it" : "there is no GROUP BY"}. ${
            lenient
              ? `${ctx.dialect === "mysql" ? "MySQL without ONLY_FULL_GROUP_BY" : "SQLite"} returns an arbitrary row's value, which is non-deterministic.`
              : "This is an error on this database."
          }`,
          snippet: names,
          fix: "Add the column to GROUP BY, wrap it in an aggregate (MAX, MIN, ANY_VALUE…), or remove it from the select list.",
        });
      }
      return hits;
    },
  },
  {
    id: "having-without-aggregate",
    category: "correctness",
    severity: "low",
    title: "HAVING without an aggregate",
    applies: ["select"],
    run: (ctx) =>
      real(ctx)
        .filter(({ node }) => node.having && !containsAggregate(node.having))
        .slice(0, 1)
        .map(({ node }) => ({
          detail: "HAVING filters after grouping. A condition on plain columns can be applied before grouping, which processes fewer rows.",
          snippet: `HAVING ${exprText(node.having)}`,
          fix: "Move the condition to WHERE.",
        })),
  },
  {
    id: "limit-without-order",
    category: "correctness",
    severity: "medium",
    title: "Row limit without ORDER BY",
    applies: ["select"],
    run: (ctx) => {
      for (const { node, isExists, isRoot } of ctx.selects) {
        if (isExists || !isRoot) continue;
        const { has, count } = limitInfo(node);
        const allAggregates = selectColumns(node).length > 0 && selectColumns(node).every((c) => containsAggregate(c.expr)) && !node.groupby;
        if (!has || node.orderby || allAggregates || sourcesOf(node).length === 0) continue;
        return [
          {
            severity: count === 1 ? "low" : "medium",
            detail: "Without ORDER BY the database may return any rows, and a different set on each run or after an index change. Paging through such results can skip or repeat rows.",
            snippet: byDialect(ctx.dialect, { sqlserver: `TOP ${count ?? "n"} … (no ORDER BY)`, default: `LIMIT ${count ?? "n"} (no ORDER BY)` }),
            fix: "Add ORDER BY on a unique, indexed column (add the primary key as a tie-breaker): ORDER BY created_at DESC, id DESC.",
          },
        ];
      }
      return [];
    },
  },
  {
    id: "duplicate-alias",
    category: "correctness",
    severity: "high",
    title: "Duplicate table alias",
    applies: ["select", "update", "delete"],
    run: (ctx) => {
      const hits = [];
      for (const { node } of ctx.selects) {
        const seen = new Set();
        for (const s of sourcesOf(node)) {
          const name = s.name.toLowerCase();
          if (!name) continue;
          if (seen.has(name)) hits.push({ detail: `The name "${s.name}" is used for two tables in the same FROM clause, so column references to it are ambiguous (most databases reject this).`, snippet: s.name, fix: "Give each table a distinct alias." });
          seen.add(name);
        }
      }
      return hits.slice(0, 2);
    },
  },
  {
    id: "union-vs-union-all",
    category: "correctness",
    severity: "low",
    title: "UNION removes duplicates",
    applies: ["select"],
    run: (ctx) =>
      ctx.selects.some(({ node }) => node.set_op === "union")
        ? [
            {
              detail: "UNION sorts or hashes the combined rows to remove duplicates, which is expensive on large results. If the branches cannot overlap, or duplicates are fine, that work is wasted.",
              snippet: "… UNION …",
              fix: "Use UNION ALL unless you need de-duplication.",
            },
          ]
        : [],
  },
  {
    id: "ambiguous-column",
    category: "correctness",
    severity: "low",
    title: "Unqualified column in a multi-table query",
    applies: ["select"],
    run: (ctx) => {
      for (const { node } of real(ctx)) {
        if (sourcesOf(node).length < 2) continue;
        const aliases = new Set(selectColumns(node).map((c) => c.alias).filter(Boolean));
        const exprs = [...selectColumns(node).map((c) => c.expr), node.where, node.having, ...(node.orderby ?? []).map((o) => o.expr), ...sourcesOf(node).map((s) => s.on)];
        const names = new Set();
        for (const e of exprs) {
          for (const ref of columnRefsIn(e)) {
            if (!ref.table && !isStar(ref) && !aliases.has(colName(ref))) names.add(colName(ref));
          }
        }
        if (names.size === 0) continue;
        const list = [...names].slice(0, 5).join(", ");
        return [
          {
            detail: `${list} ${names.size > 1 ? "have" : "has"} no table qualifier in a query over several tables. It works until someone adds a same-named column to another table; then the query breaks or, worse, binds to the wrong one.`,
            snippet: list,
            fix: "Qualify every column with its table alias (o.status, c.name).",
          },
        ];
      }
      return [];
    },
  },
];
