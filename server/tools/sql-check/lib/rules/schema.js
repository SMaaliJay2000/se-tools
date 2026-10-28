import { COMPARISON_OPS, colName, columnRefsIn, exprText, flatten, isColumn, isLiteral, isParamName, isStar, limitInfo, selectColumns, sourcesOf } from "../ast.js";
import { closestTable, findTable, leadingColumns } from "../schema.js";
import { THRESHOLDS } from "./thresholds.js";

// Rules that need the user's pasted schema. All of them are skipped when no (usable) schema was given.

const PSEUDO_COLUMNS = new Set(["rowid", "_rowid_", "oid", "ctid", "xmin", "xmax", "level", "rownum"]);

/** alias(lowercase) -> { name, table: schema table | null, kind }, for one SELECT. */
function scopeOf(select, schema, cteNames) {
  const scope = new Map();
  for (const s of sourcesOf(select)) {
    if (s.kind === "table") {
      const known = cteNames.has(s.table.toLowerCase()) ? null : findTable(schema, s.table);
      scope.set(s.name.toLowerCase(), { name: s.name, table: known, kind: cteNames.has(s.table.toLowerCase()) ? "cte" : "table", tableName: s.table });
    } else {
      scope.set(s.name.toLowerCase(), { name: s.name, table: null, kind: s.kind, tableName: null });
    }
  }
  return scope;
}

/** Which source does a column reference belong to? null when it cannot be decided. */
function ownerOf(ref, scope) {
  if (ref.table) return scope.get(String(ref.table).toLowerCase()) ?? null;
  if (scope.size === 1) return [...scope.values()][0];
  const owners = [...scope.values()].filter((o) => o.table?.columns.has(colName(ref).toLowerCase()));
  return owners.length === 1 ? owners[0] : null;
}

/** Statement-level "scopes" to check: every SELECT, plus the target table of UPDATE/DELETE. */
function scopes(ctx) {
  const out = ctx.selects.map(({ node, isExists }) => ({ select: node, where: node.where, scope: scopeOf(node, ctx.schema, ctx.cteNames), isExists }));
  if (ctx.kind === "update" || ctx.kind === "delete") {
    const targets = ctx.kind === "delete" ? (Array.isArray(ctx.ast.from) ? ctx.ast.from : ctx.ast.table) : ctx.ast.table;
    const fake = { from: (targets ?? []).filter((t) => typeof t.table === "string") };
    out.push({ select: { ...fake, where: ctx.ast.where }, where: ctx.ast.where, scope: scopeOf(fake, ctx.schema, ctx.cteNames), isExists: false, dml: true });
  }
  return out;
}

/** Column filters usable for an index seek, grouped by owning source: { equality: Set, range: Set }. */
function filterColumns(where, scope) {
  const byOwner = new Map();
  const add = (owner, col, kind) => {
    if (!owner?.table) return;
    if (!byOwner.has(owner)) byOwner.set(owner, { equality: new Set(), range: new Set() });
    byOwner.get(owner)[kind].add(col.toLowerCase());
  };
  for (const leaf of flatten(where, "AND")) {
    if (leaf.type !== "binary_expr" || !COMPARISON_OPS.has(leaf.operator)) continue;
    const [colSide, valSide] = isColumn(leaf.left) ? [leaf.left, leaf.right] : isColumn(leaf.right) ? [leaf.right, leaf.left] : [null, null];
    if (!colSide || isParamName(colName(colSide))) continue;
    // column = other_table.column is a join predicate, not a filter
    if (isColumn(valSide)) continue;
    const comparable = isLiteral(valSide) || valSide?.type === "expr_list" || valSide?.type === "function";
    if (!comparable) continue;
    const op = leaf.operator;
    if (/LIKE$/.test(op) && /^[%_]/.test(String(valSide?.value ?? ""))) continue;
    if (op === "<>" || op === "!=" || op.startsWith("NOT")) continue;
    add(ownerOf(colSide, scope), colName(colSide), ["=", "IN", "IS"].includes(op) ? "equality" : "range");
  }
  return byOwner;
}

const indexSuggestion = (table, cols) => `CREATE INDEX idx_${table.name}_${cols.join("_")} ON ${table.name} (${cols.join(", ")});`;

function collectColumnRefs(select, extraExprs = []) {
  const exprs = [...selectColumns(select).map((c) => c.expr), select.where, select.having, ...(select.orderby ?? []).map((o) => o.expr), ...sourcesOf(select).map((s) => s.on), ...extraExprs];
  const g = select.groupby;
  const groupCols = Array.isArray(g) ? g : (g?.columns ?? []);
  return [...exprs, ...groupCols].flatMap((e) => (e ? columnRefsIn(e) : []));
}

export const schemaRules = [
  {
    id: "unknown-table",
    category: "schema",
    severity: "high",
    title: "Table not found in the schema",
    needsSchema: true,
    run: (ctx) => {
      const seen = new Set();
      const hits = [];
      const names = [];
      for (const { node } of ctx.selects) for (const s of sourcesOf(node)) if (s.kind === "table") names.push(s.table);
      if (["update", "insert"].includes(ctx.kind)) for (const t of ctx.ast.table ?? []) if (typeof t.table === "string") names.push(t.table);
      if (ctx.kind === "delete") for (const t of ctx.ast.from ?? []) if (typeof t.table === "string") names.push(t.table);
      for (const name of names) {
        const key = name.toLowerCase();
        if (seen.has(key) || ctx.cteNames.has(key) || findTable(ctx.schema, name)) continue;
        seen.add(key);
        const close = closestTable(ctx.schema, name);
        hits.push({
          detail: `"${name}" is not defined in the schema you pasted${close ? `. Did you mean "${close}"?` : "."}`,
          snippet: name,
          fix: close ? `Use ${close}, or add CREATE TABLE ${name} to the schema box if it exists.` : `Add CREATE TABLE ${name} (…) to the schema box if it exists, or fix the table name.`,
        });
      }
      return hits.slice(0, 5);
    },
  },
  {
    id: "unknown-column",
    category: "schema",
    severity: "high",
    title: "Column not found in the schema",
    needsSchema: true,
    run: (ctx) => {
      const hits = [];
      const seen = new Set();
      const report = (ref, table) => {
        const key = `${table.name}.${colName(ref).toLowerCase()}`;
        if (seen.has(key)) return;
        seen.add(key);
        hits.push({
          detail: `Table "${table.name}" has no column "${colName(ref)}" in the schema you pasted (it has: ${[...table.columns].slice(0, 8).join(", ")}${table.columns.size > 8 ? ", …" : ""}).`,
          snippet: exprText(ref),
          fix: "Fix the column name, or add the column to the CREATE TABLE in the schema box.",
        });
      };
      for (const { select, scope, dml } of scopes(ctx)) {
        const allKnown = scope.size > 0 && [...scope.values()].every((o) => o.table);
        const aliases = new Set(selectColumns(select).map((c) => c.alias?.toLowerCase()).filter(Boolean));
        const refs = collectColumnRefs(select);
        if (dml && ctx.kind === "update") for (const s of ctx.ast.set ?? []) refs.push({ type: "column_ref", table: s.table ?? null, column: s.column });
        for (const ref of refs) {
          const name = colName(ref).toLowerCase();
          if (!name || isStar(ref) || isParamName(name) || PSEUDO_COLUMNS.has(name)) continue;
          if (ref.table) {
            const owner = scope.get(String(ref.table).toLowerCase());
            if (owner?.table && !owner.table.columns.has(name)) report(ref, owner.table);
          } else if (allKnown && !aliases.has(name) && ![...scope.values()].some((o) => o.table.columns.has(name))) {
            report(ref, [...scope.values()][0].table);
          }
        }
      }
      if (ctx.kind === "insert") {
        const t = findTable(ctx.schema, ctx.ast.table?.[0]?.table ?? "");
        if (t) for (const c of ctx.ast.columns ?? []) if (!t.columns.has(String(c.value ?? c).toLowerCase())) report({ type: "column_ref", column: String(c.value ?? c) }, t);
      }
      return hits.slice(0, 5);
    },
  },
  {
    id: "no-index-filter",
    category: "schema",
    severity: "medium",
    title: "Filter column has no usable index",
    needsSchema: true,
    pass: { title: "Filters use indexed columns", when: (ctx) => scopes(ctx).some((x) => x.where && filterColumns(x.where, x.scope).size > 0) },
    run: (ctx) => {
      const hits = [];
      for (const { where, scope } of scopes(ctx)) {
        if (!where) continue;
        for (const [owner, cols] of filterColumns(where, scope)) {
          const table = owner.table;
          const filterCols = new Set([...cols.equality, ...cols.range]);
          const leading = leadingColumns(table);
          if ([...filterCols].some((c) => leading.has(c))) continue;
          const composite = table.indexes.find((i) => i.columns.slice(1).some((c) => filterCols.has(c)));
          const suggested = [...cols.equality, ...cols.range].slice(0, 3);
          if (composite) {
            hits.push({
              id: "composite-index-prefix",
              title: "Composite index can't serve this filter",
              detail: `${table.name} has index ${composite.name ?? `(${composite.columns.join(", ")})`} on (${composite.columns.join(", ")}), but the query filters on ${[...filterCols].join(", ")} without its first column ${composite.columns[0]}. An index is only usable from its leftmost column, so this is a full scan.`,
              snippet: `${table.name}: ${[...filterCols].join(", ")}`,
              fix: `Filter on ${composite.columns[0]} as well, reorder the index, or add one for this access path:\n${indexSuggestion(table, suggested)}`,
            });
          } else {
            hits.push({
              detail: `No index on ${table.name} starts with ${[...filterCols].join(" or ")}, so the database has to scan the table to find matching rows.`,
              snippet: `${table.name}: ${[...filterCols].join(", ")}`,
              fix: `Add an index (equality columns first, then range):\n${indexSuggestion(table, suggested)}`,
            });
          }
        }
      }
      return hits.slice(0, 4);
    },
  },
  {
    id: "no-index-join",
    category: "schema",
    severity: "medium",
    title: "Join column has no usable index",
    needsSchema: true,
    run: (ctx) => {
      const hits = [];
      for (const { select, scope } of scopes(ctx)) {
        for (const s of sourcesOf(select)) {
          if (!s.join || s.kind !== "table") continue;
          const me = scope.get(s.name.toLowerCase());
          if (!me?.table) continue;
          const cols = new Set();
          for (const leaf of flatten(s.on, "AND")) {
            if (leaf.type !== "binary_expr" || leaf.operator !== "=") continue;
            for (const side of [leaf.left, leaf.right]) if (isColumn(side) && ownerOf(side, scope) === me) cols.add(colName(side).toLowerCase());
          }
          for (const u of s.using ?? []) cols.add(String(u.value).toLowerCase());
          const leading = leadingColumns(me.table);
          if (cols.size && ![...cols].some((c) => leading.has(c))) {
            hits.push({
              detail: `${me.table.name}.${[...cols].join(", ")} is used to join but no index starts with it, so each row from the other side triggers a scan of ${me.table.name} (or a hash join over the whole table).`,
              snippet: `JOIN ${me.table.name} ON … ${[...cols].join(", ")}`,
              fix: indexSuggestion(me.table, [...cols]),
            });
          }
        }
      }
      return hits.slice(0, 4);
    },
  },
  {
    id: "no-index-order",
    category: "schema",
    severity: "low",
    title: "ORDER BY column has no index",
    needsSchema: true,
    run: (ctx) => {
      for (const { select, scope } of scopes(ctx)) {
        const order = select.orderby?.[0]?.expr;
        if (!order || !isColumn(order) || !limitInfo(select).has) continue;
        const owner = ownerOf(order, scope);
        if (owner?.table && !leadingColumns(owner.table).has(colName(order).toLowerCase())) {
          return [
            {
              detail: `The query returns only the top rows, but no index on ${owner.table.name} starts with ${colName(order)}, so every matching row must be sorted first.`,
              snippet: `ORDER BY ${exprText(order)}`,
              fix: indexSuggestion(owner.table, [colName(order).toLowerCase()]),
            },
          ];
        }
      }
      return [];
    },
  },
  {
    id: "select-star-wide",
    category: "schema",
    severity: "low",
    title: "SELECT * on a wide table",
    needsSchema: true,
    run: (ctx) => {
      for (const { select, scope, isExists } of scopes(ctx)) {
        if (isExists) continue;
        const star = selectColumns(select).find((c) => isStar(c.expr));
        if (!star) continue;
        const owners = star.expr.table ? [scope.get(String(star.expr.table).toLowerCase())] : [...scope.values()];
        const wide = owners.find((o) => o?.table && o.table.columns.size > THRESHOLDS.wideTable);
        if (wide) {
          return [
            {
              detail: `${wide.table.name} has ${wide.table.columns.size} columns; SELECT * pulls all of them over the wire for every row.`,
              snippet: "SELECT *",
              fix: "List just the columns you need.",
            },
          ];
        }
      }
      return [];
    },
  },
];
