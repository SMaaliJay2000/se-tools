import { colName, isColumn } from "./ast.js";
import { parseStatement } from "./parse.js";
import { splitStatements } from "./split.js";

/**
 * Schema model built from pasted CREATE TABLE / CREATE INDEX / ALTER TABLE ADD INDEX statements.
 * tables: Map<lowercase name, { name, columns: Set<lowercase>, indexes: [{ name, columns: string[], unique, primary }] }>
 * An index column of "(expr)" stands for an expression, which never matches a plain column.
 */
export function buildSchema(ddl, dialect) {
  const tables = new Map();
  const notices = [];

  const tableOf = (name) => {
    const key = String(name).toLowerCase();
    if (!tables.has(key)) tables.set(key, { name: String(name), columns: new Set(), indexes: [] });
    return tables.get(key);
  };
  const colsOf = (list) => (list ?? []).map((c) => (isColumn(c) ? colName(c).toLowerCase() : "(expr)"));
  const addIndex = (table, name, columns, flags = {}) => {
    if (columns.length) table.indexes.push({ name: name ?? null, columns, unique: !!flags.unique, primary: !!flags.primary });
  };
  const indexName = (n) => (typeof n === "string" ? n : (n?.name ?? null));

  const addDefinition = (table, def) => {
    if (def.resource === "column") {
      const col = colName(def.column).toLowerCase();
      table.columns.add(col);
      if (def.primary_key) addIndex(table, "PRIMARY", [col], { unique: true, primary: true });
      else if (def.unique) addIndex(table, null, [col], { unique: true });
      // MySQL (InnoDB) creates an index for every foreign key automatically.
      if (def.reference_definition && dialect === "mysql") addIndex(table, null, [col]);
    } else if (def.resource === "constraint") {
      const type = String(def.constraint_type ?? "").toLowerCase();
      const cols = colsOf(def.definition);
      if (type.includes("primary")) addIndex(table, "PRIMARY", cols, { unique: true, primary: true });
      else if (type.includes("unique")) addIndex(table, indexName(def.index) ?? def.constraint ?? null, cols, { unique: true });
      else if (type.includes("foreign") && dialect === "mysql") addIndex(table, def.constraint ?? null, cols);
    } else if (def.resource === "index") {
      if (!/fulltext|spatial/i.test(String(def.keyword ?? ""))) addIndex(table, indexName(def.index), colsOf(def.definition));
    }
  };

  for (const stmt of splitStatements(ddl, dialect)) {
    const { ast, error } = parseStatement(stmt.text, dialect);
    if (error) {
      notices.push(`Schema line ${stmt.line}: could not parse (${error.message}). Ignored.`);
      continue;
    }
    if (ast.type === "create" && ast.keyword === "table") {
      const table = tableOf(ast.table?.[0]?.table);
      for (const def of ast.create_definitions ?? []) addDefinition(table, def);
    } else if (ast.type === "create" && ast.keyword === "index") {
      const table = tableOf(ast.table?.table);
      addIndex(table, indexName(ast.index), colsOf(ast.index_columns), { unique: /unique/i.test(String(ast.index_type ?? "")) });
    } else if (ast.type === "alter") {
      const table = tableOf(ast.table?.[0]?.table);
      for (const e of ast.expr ?? []) {
        if (e.action === "add" && (e.resource === "index" || e.resource === "constraint")) addDefinition(table, e);
      }
    }
  }
  if (tables.size === 0) notices.push("No CREATE TABLE statements found in the schema, so schema checks were skipped.");
  return { tables, notices, indexCount: [...tables.values()].reduce((n, t) => n + t.indexes.length, 0) };
}

export const findTable = (schema, name) => schema.tables.get(String(name).toLowerCase()) ?? null;

/** Columns that start at least one index (primary key and unique constraints included). */
export const leadingColumns = (table) => new Set(table.indexes.map((i) => i.columns[0]));

/** Closest known table name within edit distance 2, for "did you mean". */
export function closestTable(schema, name) {
  const target = String(name).toLowerCase();
  let best = null;
  let bestDistance = 3;
  for (const t of schema.tables.values()) {
    const d = distance(target, t.name.toLowerCase());
    if (d < bestDistance) {
      best = t.name;
      bestDistance = d;
    }
  }
  return best;
}

function distance(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
