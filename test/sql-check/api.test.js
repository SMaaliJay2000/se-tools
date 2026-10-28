import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import app from "../../server/app.js";

let server;
let base;

before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });
  base = `http://127.0.0.1:${server.address().port}/api/sql-check`;
});
after(() => server.close());

async function post(path, body, expected = 200) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  assert.equal(res.status, expected, `${path} -> ${res.status}`);
  return res.json();
}

test("GET /options lists dialects and limits", async () => {
  const json = await (await fetch(`${base}/options`)).json();
  assert.deepEqual(json.dialects.map((d) => d.id), ["postgresql", "mysql", "sqlserver", "sqlite"]);
  assert.equal(json.limits.maxStatements, 50);
});

test("analyze returns statements, findings and an overall score", async () => {
  const json = await post("/analyze", { sql: "UPDATE users SET a = 1;\nSELECT id FROM users WHERE id = 1;", dialect: "mysql" });
  assert.equal(json.statements.length, 2);
  assert.equal(json.statements[0].kind, "update");
  assert.equal(json.statements[1].line, 2);
  assert.ok(json.findings.some((f) => f.id === "update-no-where" && f.severity === "critical" && f.statement === 0));
  assert.equal(json.score.grade, "F");
  assert.equal(json.schema, null);
});

test("a schema in the request enables schema findings", async () => {
  const json = await post("/analyze", { sql: "SELECT id FROM t WHERE x = 1", dialect: "postgresql", schema: "CREATE TABLE t (id INT PRIMARY KEY, x INT)" });
  assert.ok(json.findings.some((f) => f.id === "no-index-filter"));
  assert.equal(json.schema.tables, 1);
});

test("a syntax error in the SQL is a 200 result with a finding, not a 400", async () => {
  const json = await post("/analyze", { sql: "SELEC 1", dialect: "postgresql" });
  assert.equal(json.statements[0].parsed, false);
  assert.ok(json.findings.some((f) => f.id === "syntax-error"));
});

test("bad requests get 400 with a stable code", async () => {
  assert.equal((await post("/analyze", { dialect: "mysql" }, 400)).code, "invalid_input");
  assert.equal((await post("/analyze", { sql: "SELECT 1", dialect: "oracle" }, 400)).code, "unknown_dialect");
  assert.equal((await post("/analyze", { sql: "-- only a comment", dialect: "mysql" }, 400)).code, "empty_sql");
  assert.equal((await post("/analyze", { sql: 5, dialect: "mysql" }, 400)).code, "invalid_input");
  assert.equal((await post("/analyze", { sql: "x".repeat(100_001), dialect: "mysql" }, 400)).code, "too_long");
  assert.equal((await post("/analyze", { sql: Array(51).fill("SELECT 1").join(";"), dialect: "mysql" }, 400)).code, "too_many_statements");
});

test("an oversized single statement is skipped with an info finding instead of being parsed", async () => {
  const sql = `SELECT ${Array.from({ length: 4000 }, (_, i) => `c${i}`).join(", ")} FROM t WHERE id = 1`;
  const json = await post("/analyze", { sql, dialect: "postgresql" });
  assert.ok(json.findings.some((f) => f.id === "statement-too-long"));
});
