import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSql } from "../../server/tools/sql-check/lib/analyze.js";

const run = (sql, dialect = "postgresql", schema) => analyzeSql({ sql, dialect, schema });
const issues = (sql, dialect, schema) => run(sql, dialect, schema).findings.filter((f) => f.severity !== "pass");
const ids = (sql, dialect, schema) => new Set(issues(sql, dialect, schema).map((f) => f.id));
const passes = (sql, dialect) => new Set(run(sql, dialect).findings.filter((f) => f.severity === "pass").map((f) => f.id));

// [rule id, dialect, SQL that must trigger it, SQL that must not]
const CASES = [
  ["update-no-where", "postgresql", "UPDATE users SET active = false", "UPDATE users SET active = false WHERE id = 1"],
  ["delete-no-where", "mysql", "DELETE FROM sessions", "DELETE FROM sessions WHERE id = 1"],
  ["delete-no-where", "sqlserver", "DELETE FROM dbo.sessions", "DELETE FROM dbo.sessions WHERE id = 1"],
  ["where-tautology", "mysql", "DELETE FROM t WHERE 1 = 1", "DELETE FROM t WHERE id = 1"],
  ["where-tautology", "postgresql", "UPDATE t SET a = 1 WHERE id = 1 OR 1 = 1", "UPDATE t SET a = 1 WHERE id = 1 OR id = 2"],
  ["destructive-ddl", "postgresql", "DROP TABLE users", "CREATE TABLE users (id INT)"],
  ["destructive-ddl", "mysql", "TRUNCATE TABLE logs", "SELECT 1"],
  ["cartesian-join", "mysql", "SELECT a.id FROM a, b WHERE a.x = 1", "SELECT a.id FROM a, b WHERE a.id = b.a_id"],
  ["cartesian-join", "postgresql", "SELECT 1 FROM a JOIN b ON 1 = 1", "SELECT 1 FROM a JOIN b ON a.id = b.a_id"],
  ["implicit-join", "mysql", "SELECT a.id FROM a, b WHERE a.id = b.a_id", "SELECT a.id FROM a JOIN b ON a.id = b.a_id"],
  ["null-comparison", "mysql", "SELECT 1 FROM t WHERE a = NULL", "SELECT 1 FROM t WHERE a IS NULL"],
  ["null-comparison", "postgresql", "SELECT 1 FROM t WHERE a <> NULL", "SELECT 1 FROM t WHERE a IS NOT NULL"],
  ["not-in-subquery", "postgresql", "SELECT 1 FROM t WHERE id NOT IN (SELECT t_id FROM u)", "SELECT 1 FROM t WHERE NOT EXISTS (SELECT 1 FROM u WHERE u.t_id = t.id)"],
  ["insert-no-columns", "mysql", "INSERT INTO t VALUES (1, 2)", "INSERT INTO t (a, b) VALUES (1, 2)"],
  ["insert-count-mismatch", "mysql", "INSERT INTO t (a, b) VALUES (1)", "INSERT INTO t (a, b) VALUES (1, 2)"],
  ["group-by-nonaggregated", "postgresql", "SELECT dept, name, COUNT(*) FROM e GROUP BY dept", "SELECT dept, COUNT(*) FROM e GROUP BY dept"],
  ["group-by-nonaggregated", "mysql", "SELECT dept, COUNT(*), name FROM e", "SELECT dept, COUNT(*) FROM e GROUP BY dept"],
  ["having-without-aggregate", "postgresql", "SELECT dept FROM e GROUP BY dept HAVING dept = 'x'", "SELECT dept FROM e GROUP BY dept HAVING COUNT(*) > 1"],
  ["limit-without-order", "postgresql", "SELECT id FROM t LIMIT 5", "SELECT id FROM t ORDER BY id LIMIT 5"],
  ["limit-without-order", "sqlserver", "SELECT TOP 5 id FROM t", "SELECT TOP 5 id FROM t ORDER BY id"],
  ["duplicate-alias", "mysql", "SELECT 1 FROM a x JOIN b x ON x.id = x.id", "SELECT 1 FROM a x JOIN b y ON x.id = y.id"],
  ["union-vs-union-all", "mysql", "SELECT a FROM t1 UNION SELECT a FROM t2", "SELECT a FROM t1 UNION ALL SELECT a FROM t2"],
  ["ambiguous-column", "mysql", "SELECT id FROM a JOIN b ON a.id = b.id", "SELECT a.id FROM a JOIN b ON a.id = b.id"],
  ["select-star", "postgresql", "SELECT * FROM users WHERE id = 1", "SELECT id FROM users WHERE id = 1"],
  ["select-star", "mysql", "SELECT u.* FROM users u WHERE u.id = 1", "SELECT COUNT(*) FROM users"],
  ["no-where-select", "postgresql", "SELECT id FROM users", "SELECT id FROM users WHERE id = 1"],
  ["no-where-select", "mysql", "SELECT id FROM users", "SELECT id FROM users LIMIT 10"],
  ["non-sargable", "postgresql", "SELECT id FROM u WHERE LOWER(email) = 'a'", "SELECT id FROM u WHERE email = LOWER('A')"],
  ["non-sargable", "mysql", "SELECT id FROM u WHERE DATE(created) = '2024-01-01'", "SELECT id FROM u WHERE created >= '2024-01-01' AND created < '2024-01-02'"],
  ["non-sargable", "sqlserver", "SELECT id FROM u WHERE YEAR(created) = 2024", "SELECT id FROM u WHERE created >= '2024-01-01'"],
  ["non-sargable", "mysql", "SELECT id FROM u WHERE age + 1 > 10", "SELECT id FROM u WHERE age > 9"],
  ["leading-wildcard-like", "mysql", "SELECT id FROM u WHERE name LIKE '%son'", "SELECT id FROM u WHERE name LIKE 'son%'"],
  ["like-no-wildcard", "mysql", "SELECT id FROM u WHERE name LIKE 'son'", "SELECT id FROM u WHERE name LIKE 'son%'"],
  ["or-different-columns", "mysql", "SELECT id FROM u WHERE a = 1 OR b = 2", "SELECT id FROM u WHERE a = 1 AND b = 2"],
  ["or-same-column", "mysql", "SELECT id FROM u WHERE a = 1 OR a = 2", "SELECT id FROM u WHERE a IN (1, 2)"],
  ["large-in-list", "mysql", `SELECT id FROM u WHERE id IN (${Array.from({ length: 101 }, (_, i) => i).join(",")})`, "SELECT id FROM u WHERE id IN (1, 2, 3)"],
  ["deep-offset", "postgresql", "SELECT id FROM t ORDER BY id LIMIT 10 OFFSET 5000", "SELECT id FROM t ORDER BY id LIMIT 10 OFFSET 20"],
  ["deep-offset", "sqlserver", "SELECT id FROM t ORDER BY id OFFSET 5000 ROWS FETCH NEXT 10 ROWS ONLY", "SELECT id FROM t ORDER BY id OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY"],
  ["order-by-random", "mysql", "SELECT id FROM t ORDER BY RAND() LIMIT 1", "SELECT id FROM t ORDER BY id LIMIT 1"],
  ["order-by-random", "postgresql", "SELECT id FROM t ORDER BY random() LIMIT 1", "SELECT id FROM t ORDER BY id LIMIT 1"],
  ["order-by-random", "sqlserver", "SELECT TOP 1 id FROM t ORDER BY NEWID()", "SELECT TOP 1 id FROM t ORDER BY id"],
  ["select-list-subquery", "postgresql", "SELECT (SELECT COUNT(*) FROM o WHERE o.u = u.id) AS c FROM u WHERE u.id = 1", "SELECT u.id FROM u WHERE u.id = 1"],
  ["many-joins", "postgresql", `SELECT a.id FROM a ${"JOIN b ON b.id = a.id ".repeat(6)}WHERE a.id = 1`, "SELECT a.id FROM a JOIN b ON b.id = a.id WHERE a.id = 1"],
  ["select-distinct-join", "mysql", "SELECT DISTINCT a.id FROM a JOIN b ON b.a_id = a.id WHERE a.x = 1", "SELECT DISTINCT a.id FROM a WHERE a.x = 1"],
  ["negation-predicate", "mysql", "SELECT id FROM u WHERE status <> 'active'", "SELECT id FROM u WHERE status = 'active'"],
];

for (const [id, dialect, bad, good] of CASES) {
  test(`${id} [${dialect}] fires on: ${bad.slice(0, 60)}`, () => {
    assert.ok(ids(bad, dialect).has(id), `expected ${id}, got ${[...ids(bad, dialect)].join(", ") || "nothing"}`);
  });
  test(`${id} [${dialect}] stays quiet on: ${good.slice(0, 60)}`, () => {
    assert.ok(!ids(good, dialect).has(id), `did not expect ${id}`);
  });
}

test("severity matches the rule: missing WHERE is critical, SELECT * is medium, non-sargable is high", () => {
  const sev = (sql, id, d = "postgresql") => issues(sql, d).find((f) => f.id === id)?.severity;
  assert.equal(sev("UPDATE t SET a = 1", "update-no-where"), "critical");
  assert.equal(sev("SELECT * FROM t WHERE id = 1", "select-star"), "medium");
  assert.equal(sev("SELECT id FROM t WHERE LOWER(a) = 'x'", "non-sargable"), "high");
  assert.equal(sev("SELECT dept, name, COUNT(*) FROM e GROUP BY dept", "group-by-nonaggregated", "postgresql"), "high");
  assert.equal(sev("SELECT dept, name, COUNT(*) FROM e GROUP BY dept", "group-by-nonaggregated", "mysql"), "medium");
});

test("every finding that is not a pass carries a fix and a detail", () => {
  const sqls = ["UPDATE t SET a = 1", "SELECT * FROM a, b WHERE LOWER(a.x) LIKE '%y' ORDER BY RANDOM()", "SELECT id FROM t WHERE a = NULL OR b = 1 LIMIT 5 OFFSET 9000"];
  for (const sql of sqls) {
    for (const f of issues(sql, "postgresql")) {
      assert.ok(f.detail?.length > 10, `${f.id} has no detail`);
      assert.ok(f.fix?.length > 5, `${f.id} has no fix`);
    }
  }
});

test("EXISTS subqueries do not trigger SELECT * or full-scan findings", () => {
  const found = ids("SELECT u.id FROM u WHERE EXISTS (SELECT * FROM o)", "postgresql");
  assert.ok(!found.has("select-star"));
  assert.ok(!found.has("no-where-select"));
});

test("a clean, selective query earns pass findings and an A+", () => {
  const r = run("SELECT u.id, u.name FROM users u JOIN orders o ON o.user_id = u.id WHERE u.status = 'active' ORDER BY u.id LIMIT 20", "postgresql");
  assert.equal(r.score.grade, "A+");
  assert.deepEqual(issues("SELECT id FROM t WHERE id = 1", "postgresql"), []);
  assert.ok(passes("UPDATE t SET a = 1 WHERE id = 1", "postgresql").has("update-no-where"));
});

test("a syntax error is a finding, not an exception, and other statements are still analysed", () => {
  const r = run("SELEC * FROM a; UPDATE t SET x = 1", "postgresql");
  assert.equal(r.statements.length, 2);
  assert.equal(r.statements[0].parsed, false);
  assert.equal(r.statements[0].parseError.line, 1);
  assert.ok(r.statements[0].findings.some((f) => f.id === "syntax-error"));
  assert.ok(r.statements[1].findings.some((f) => f.id === "update-no-where"));
  assert.equal(r.statements[1].line, 1);
});

test("an unparsable UPDATE/DELETE without WHERE is still caught by the keyword fallback", () => {
  const found = ids("UPDATE users SET a = = 1", "postgresql");
  assert.ok(found.has("syntax-error") && found.has("update-no-where"));
  assert.ok(!ids("DELETE FROM t WHERE x = = 1", "postgresql").has("delete-no-where"));
});

test("a syntax error names the dialect the SQL actually belongs to", () => {
  const f = issues("SELECT TOP 5 * FROM t", "mysql").find((x) => x.id === "syntax-error");
  assert.match(f.detail, /sqlserver/);
  assert.equal(issues("SELECT TOP 5 id FROM t ORDER BY id", "sqlserver").some((x) => x.id === "syntax-error"), false);
});

test("subqueries, CTEs and unions are analysed too", () => {
  assert.ok(ids("SELECT id FROM (SELECT * FROM big) d WHERE d.id = 1", "postgresql").has("select-star"));
  assert.ok(ids("WITH x AS (SELECT * FROM big) SELECT id FROM x WHERE id = 1", "postgresql").has("select-star"));
  assert.ok(ids("SELECT id FROM a WHERE id = 1 UNION ALL SELECT id FROM b", "postgresql").has("no-where-select"));
});
