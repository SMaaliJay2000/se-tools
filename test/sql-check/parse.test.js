import test from "node:test";
import assert from "node:assert/strict";
import { guessDialect, kindOf, parseStatement } from "../../server/tools/sql-check/lib/parse.js";

test("parses the same statement in every supported dialect", () => {
  for (const d of ["postgresql", "mysql", "sqlserver", "sqlite"]) {
    const { ast, error } = parseStatement("SELECT id FROM users WHERE id = 1", d);
    assert.ok(!error, `${d}: ${error?.message}`);
    assert.equal(kindOf(ast), "select");
  }
});

test("syntax errors report a position", () => {
  const { error } = parseStatement("SELECT * FROM users\nWHERE id = ", "mysql");
  assert.equal(error.kind, "syntax");
  assert.equal(error.line, 2);
  assert.ok(error.column > 1);
});

test("INSERT column/value mismatch is its own error kind", () => {
  const { error } = parseStatement("INSERT INTO t (a, b) VALUES (1)", "mysql");
  assert.equal(error.kind, "insert-count-mismatch");
});

test("guessDialect finds the dialect a statement was written for", () => {
  assert.equal(guessDialect("SELECT TOP 5 * FROM t", "mysql"), "sqlserver");
  assert.equal(guessDialect("SELEC nonsense", "mysql"), null);
});

test("kindOf classifies statements", () => {
  const kind = (sql) => kindOf(parseStatement(sql, "mysql").ast);
  assert.equal(kind("UPDATE t SET a = 1"), "update");
  assert.equal(kind("DELETE FROM t"), "delete");
  assert.equal(kind("INSERT INTO t (a) VALUES (1)"), "insert");
  assert.equal(kind("CREATE TABLE t (a INT)"), "create");
  assert.equal(kind("DROP TABLE t"), "drop");
  assert.equal(kind("TRUNCATE TABLE t"), "truncate");
});
