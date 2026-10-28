// `build` is the node-sql-parser grammar the dialect maps to (see parse.js).
export const DIALECTS = [
  { id: "postgresql", label: "PostgreSQL", build: "postgresql" },
  { id: "mysql", label: "MySQL / MariaDB", build: "mysql" },
  { id: "sqlserver", label: "SQL Server", build: "transactsql" },
  { id: "sqlite", label: "SQLite", build: "sqlite" },
];

export const DIALECT_IDS = DIALECTS.map((d) => d.id);

export const LIMITS = {
  maxSqlChars: 100_000,
  maxSchemaChars: 100_000,
  maxStatements: 50,
  // The grammar is a PEG parser that runs synchronously, so cap what a single statement may cost.
  maxStatementChars: 20_000,
};

/** Picks the text for the current dialect: byDialect("mysql", { mysql: "a", default: "b" }). */
export const byDialect = (dialect, options) => options[dialect] ?? options.default ?? "";
