import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSql } from "../../server/tools/sql-check/lib/analyze.js";
import { buildSchema } from "../../server/tools/sql-check/lib/schema.js";

const SCHEMA = `
CREATE TABLE users (id INT PRIMARY KEY, email VARCHAR(100) UNIQUE, org_id INT, created_at TIMESTAMP, status VARCHAR(10));
CREATE TABLE orders (id INT PRIMARY KEY, user_id INT, status VARCHAR(10), total INT);
CREATE INDEX idx_users_org_created ON users (org_id, created_at);
`;

const found = (sql, dialect = "postgresql", schema = SCHEMA) =>
  analyzeSql({ sql, dialect, schema }).findings.filter((f) => f.severity !== "pass");
const has = (sql, id, dialect, schema) => found(sql, dialect, schema).some((f) => f.id === id);

test("builds tables, columns, primary keys, unique constraints and indexes", () => {
  const { tables, indexCount, notices } = buildSchema(SCHEMA, "postgresql");
  assert.deepEqual([...tables.keys()], ["users", "orders"]);
  assert.deepEqual([...tables.get("users").columns], ["id", "email", "org_id", "created_at", "status"]);
  const names = tables.get("users").indexes.map((i) => i.columns.join(","));
  assert.deepEqual(names, ["id", "email", "org_id,created_at"]);
  assert.equal(indexCount, 4); // users: id, email, (org_id, created_at); orders: id
  assert.deepEqual(notices, []);
});

test("understands MySQL KEY/UNIQUE KEY, composite primary keys and implicit foreign-key indexes", () => {
  const ddl = `CREATE TABLE m (a INT, b INT, c INT, d INT, PRIMARY KEY (a, b), KEY idx_c (c), UNIQUE KEY ux (d, c), FOREIGN KEY (b) REFERENCES x(id));`;
  const t = buildSchema(ddl, "mysql").tables.get("m");
  assert.deepEqual(t.indexes.map((i) => i.columns.join(",")), ["a,b", "c", "d,c", "b"]);
});

test("understands SQL Server clustered keys, SQLite inline keys and ALTER TABLE ADD INDEX", () => {
  const ms = buildSchema("CREATE TABLE dbo.o (id INT IDENTITY(1,1) NOT NULL, uid INT, CONSTRAINT pk PRIMARY KEY CLUSTERED (id)); CREATE NONCLUSTERED INDEX ix ON dbo.o (uid, id)", "sqlserver").tables.get("o");
  assert.deepEqual(ms.indexes.map((i) => i.columns.join(",")), ["id", "uid,id"]);
  const lite = buildSchema("CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT); CREATE INDEX IF NOT EXISTS ix ON t(name)", "sqlite").tables.get("t");
  assert.deepEqual(lite.indexes.map((i) => i.columns.join(",")), ["id", "name"]);
  const alt = buildSchema("CREATE TABLE o (id INT, uid INT); ALTER TABLE o ADD INDEX ix (uid)", "mysql").tables.get("o");
  assert.deepEqual(alt.indexes.map((i) => i.columns.join(",")), ["uid"]);
});

test("bad schema statements become notices, not failures", () => {
  const { tables, notices } = buildSchema("CREATE TABLE ok (id INT); CREATE TABEL nope (id INT);", "postgresql");
  assert.equal(tables.size, 1);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /Schema line 1/);
});

test("no-index-filter: filtering on an unindexed column", () => {
  const f = found("SELECT id FROM users WHERE status = 'active'").find((x) => x.id === "no-index-filter");
  assert.ok(f);
  assert.match(f.fix, /CREATE INDEX idx_users_status ON users \(status\)/);
});

test("indexed filters are fine: primary key, unique column, leading column of a composite index", () => {
  for (const sql of ["SELECT id FROM users WHERE id = 1", "SELECT id FROM users WHERE email = 'x'", "SELECT id FROM users WHERE org_id = 5", "SELECT id FROM users WHERE org_id = 5 AND created_at > '2024-01-01'"]) {
    assert.ok(!has(sql, "no-index-filter") && !has(sql, "composite-index-prefix"), sql);
  }
});

test("composite-index-prefix: filtering on the second column of a composite index only", () => {
  const f = found("SELECT id FROM users WHERE created_at > '2024-01-01'").find((x) => x.id === "composite-index-prefix");
  assert.ok(f);
  assert.match(f.detail, /org_id/);
});

test("no-index-join: join column without an index", () => {
  assert.ok(has("SELECT u.id FROM users u JOIN orders o ON o.user_id = u.id WHERE u.id = 1", "no-index-join"));
  assert.ok(!has("SELECT o.id FROM orders o JOIN users u ON u.id = o.user_id WHERE o.id = 1", "no-index-join"));
});

test("no-index-order: ORDER BY with LIMIT on an unindexed column", () => {
  assert.ok(has("SELECT id FROM users WHERE id > 5 ORDER BY status LIMIT 10", "no-index-order"));
  assert.ok(!has("SELECT id FROM users WHERE id > 5 ORDER BY id LIMIT 10", "no-index-order"));
});

test("unknown-table suggests the closest table", () => {
  const f = found("SELECT id FROM userz WHERE id = 1").find((x) => x.id === "unknown-table");
  assert.match(f.detail, /Did you mean "users"/);
});

test("unknown-column: qualified, unqualified, UPDATE targets and INSERT lists", () => {
  assert.ok(has("SELECT u.emial FROM users u WHERE u.id = 1", "unknown-column"));
  assert.ok(has("SELECT id FROM users WHERE nope = 1", "unknown-column"));
  assert.ok(has("UPDATE users SET nope = 1 WHERE id = 1", "unknown-column"));
  assert.ok(has("INSERT INTO users (id, nope) VALUES (1, 2)", "unknown-column"));
  assert.ok(!has("SELECT u.email AS e FROM users u WHERE u.id = 1 ORDER BY e", "unknown-column"));
  assert.ok(!has("WITH x AS (SELECT id FROM users) SELECT id FROM x WHERE id = 1", "unknown-table"));
});

test("UPDATE and DELETE filters are checked against indexes too", () => {
  assert.ok(has("UPDATE users SET org_id = 1 WHERE status = 'x'", "no-index-filter"));
  assert.ok(has("DELETE FROM orders WHERE status = 'x'", "no-index-filter"));
});

test("select-star-wide fires only on genuinely wide tables", () => {
  const cols = Array.from({ length: 25 }, (_, i) => `c${i} INT`).join(", ");
  assert.ok(has("SELECT * FROM wide WHERE id = 1", "select-star-wide", "postgresql", `CREATE TABLE wide (id INT PRIMARY KEY, ${cols})`));
  assert.ok(!has("SELECT * FROM users WHERE id = 1", "select-star-wide"));
});

test("without a schema, schema rules are skipped and the result says so", () => {
  const r = analyzeSql({ sql: "SELECT id FROM nope WHERE x = 1", dialect: "postgresql" });
  assert.equal(r.schema, null);
  assert.ok(!r.findings.some((f) => f.category === "schema"));
  const empty = analyzeSql({ sql: "SELECT id FROM nope WHERE x = 1", dialect: "postgresql", schema: "-- nothing" });
  assert.equal(empty.schema.tables, 0);
  assert.ok(!empty.findings.some((f) => f.category === "schema"));
});
