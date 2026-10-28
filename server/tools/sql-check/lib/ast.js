// Helpers over node-sql-parser ASTs. The shapes differ a little per dialect (column names are a string in MySQL/T-SQL
// but { expr: { value } } in PostgreSQL; LIMIT/TOP/FETCH are three different nodes), so rules go through these
// instead of reading raw nodes.

const isObj = (x) => x !== null && typeof x === "object";

/** Depth-first walk over every object in the tree. `visit(node, ancestors)`; return false to skip a subtree. */
export function walk(node, visit, ancestors = []) {
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, ancestors);
    return;
  }
  if (!isObj(node)) return;
  if (visit(node, ancestors) === false) return;
  ancestors.push(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "tableList" || key === "columnList") continue;
    walk(value, visit, ancestors);
  }
  ancestors.pop();
}

export const colName = (ref) => {
  const c = ref?.column;
  if (typeof c === "string") return c;
  return c?.expr?.value != null ? String(c.expr.value) : "";
};

export const isColumn = (n) => n?.type === "column_ref" && colName(n) !== "*";
export const isStar = (n) => n?.type === "column_ref" && colName(n) === "*";
export const isParamName = (name) => name.startsWith("@") || name.startsWith(":") || name.startsWith("$");
export const isLiteral = (n) => ["number", "single_quote_string", "double_quote_string", "string", "bool", "null", "param", "origin", "hex_string"].includes(n?.type);

export function fnName(n) {
  if (n?.type === "aggr_func") return String(n.name).toUpperCase();
  if (n?.type !== "function") return "";
  const name = n.name;
  if (typeof name === "string") return name.toUpperCase();
  return String(name?.name?.[0]?.value ?? "").toUpperCase();
}

export const isSubquery = (n) => isObj(n) && isObj(n.ast) && n.ast.type === "select";

/** Visits an expression without descending into subqueries. */
function walkExpr(expr, visit) {
  walk(expr, (n) => {
    if (isSubquery(n)) return false;
    return visit(n);
  });
}

export function columnRefsIn(expr) {
  const out = [];
  walkExpr(expr, (n) => {
    if (isColumn(n) && !isParamName(colName(n))) out.push(n);
  });
  return out;
}

export function containsAggregate(expr) {
  let found = false;
  walkExpr(expr, (n) => {
    if (n.type === "aggr_func") found = true;
  });
  return found;
}

/** Splits `a AND b AND c` into [a, b, c] (or the same for OR). Parenthesised groups stay whole unless they use the same operator. */
export function flatten(expr, op) {
  if (!expr) return [];
  if (expr.type === "binary_expr" && expr.operator === op) return [...flatten(expr.left, op), ...flatten(expr.right, op)];
  return [expr];
}

/** Short readable form of an expression, for snippets in findings. */
export function exprText(n, depth = 0) {
  if (!isObj(n) || depth > 4) return "…";
  switch (n.type) {
    case "column_ref":
      return `${n.table ? `${n.table}.` : ""}${colName(n)}`;
    case "function":
    case "aggr_func": {
      const args = n.args?.value ?? (n.args?.expr ? [n.args.expr] : []);
      return `${fnName(n)}(${args.slice(0, 3).map((a) => exprText(a, depth + 1)).join(", ")})`;
    }
    case "number":
    case "bool":
      return String(n.value);
    case "single_quote_string":
    case "string":
      return `'${n.value}'`;
    case "null":
      return "NULL";
    case "param":
      return `:${n.value}`;
    case "origin":
      return String(n.value).toUpperCase();
    case "cast":
      return `CAST(${exprText(n.expr, depth + 1)} AS ${n.target?.[0]?.dataType ?? "?"})`;
    case "binary_expr":
      return `${exprText(n.left, depth + 1)} ${n.operator} ${exprText(n.right, depth + 1)}`;
    default:
      return "…";
  }
}

/** Every SELECT in a statement (subqueries, CTEs, UNION branches), with where it sits. */
export function selectsIn(ast) {
  const out = [];
  walk(ast, (node, ancestors) => {
    if (node.type === "select") {
      const near = ancestors.slice(-4);
      out.push({
        node,
        isRoot: ancestors.length === 0,
        isExists: near.some((a) => a.type === "function" && /EXISTS$/.test(fnName(a))),
      });
    }
  });
  return out;
}

/** FROM entries normalised: { kind: "table"|"derived"|"other", table, alias, name, join, on, using }. */
export function sourcesOf(select) {
  const from = Array.isArray(select.from) ? select.from : [];
  return from.map((f) => {
    const base = { join: f.join ?? null, on: f.on ?? null, using: f.using ?? null };
    if (typeof f.table === "string") {
      return { ...base, kind: "table", table: f.table, db: f.db ?? null, alias: f.as ?? null, name: f.as ?? f.table };
    }
    if (isSubquery(f.expr)) return { ...base, kind: "derived", table: null, alias: f.as ?? null, name: f.as ?? "(subquery)" };
    return { ...base, kind: "other", table: null, alias: f.as ?? null, name: f.as ?? "" };
  });
}

const num = (x) => {
  if (typeof x === "number") return x;
  if (x?.type === "number") return Number(x.value);
  return null;
};

/** { has, count, offset } across LIMIT n [OFFSET m], LIMIT m, n, TOP n and OFFSET .. FETCH NEXT .. */
export function limitInfo(select) {
  let has = false;
  let count = null;
  let offset = null;
  if (select.top) {
    has = true;
    count = num(select.top.value);
  }
  const l = select.limit;
  if (l) {
    if (Array.isArray(l.value)) {
      if (l.value.length) {
        has = true;
        const [a, b] = l.value;
        if (l.seperator === ",") {
          offset = num(a);
          count = num(b);
        } else {
          count = num(a);
          if (l.seperator === "offset") offset = num(b);
        }
      }
    } else if (l.fetch || l.offset) {
      has = !!l.fetch;
      count = num(l.fetch?.value);
      offset = num(l.offset?.value);
    }
  }
  return { has, count, offset };
}

/** Normalised select-list entries: { expr, alias }. */
export const selectColumns = (select) => (Array.isArray(select.columns) ? select.columns.map((c) => ({ expr: c.expr, alias: c.as ?? null })) : []);

/** Predicate-style operators whose left/right operands are "the thing being compared". */
export const COMPARISON_OPS = new Set(["=", "<>", "!=", "<", ">", "<=", ">=", "LIKE", "NOT LIKE", "ILIKE", "NOT ILIKE", "IN", "NOT IN", "BETWEEN", "NOT BETWEEN", "IS", "IS NOT"]);
