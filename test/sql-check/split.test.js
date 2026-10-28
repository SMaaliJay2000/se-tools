import test from "node:test";
import assert from "node:assert/strict";
import { splitStatements, stripLiteralsAndComments } from "../../server/tools/sql-check/lib/split.js";

const texts = (sql, dialect = "postgresql") => splitStatements(sql, dialect).map((s) => s.text);

test("splits on semicolons and records the first line of each statement", () => {
  const parts = splitStatements("SELECT 1;\n\nSELECT 2;\nSELECT 3", "mysql");
  assert.deepEqual(parts.map((p) => [p.text, p.line]), [["SELECT 1", 1], ["SELECT 2", 3], ["SELECT 3", 4]]);
});

test("ignores semicolons inside strings, quoted identifiers and comments", () => {
  assert.deepEqual(texts("SELECT 'a;b'; SELECT \"c;d\"; SELECT `e;f`; -- x;y\nSELECT 4 /* ; */", "mysql"), ["SELECT 'a;b'", 'SELECT "c;d"', "SELECT `e;f`", "SELECT 4 /* ; */"]);
});

test("handles doubled quotes and MySQL backslash escapes", () => {
  assert.deepEqual(texts("SELECT 'it''s; ok'; SELECT 2", "postgresql"), ["SELECT 'it''s; ok'", "SELECT 2"]);
  assert.deepEqual(texts("SELECT 'it\\'s; ok'; SELECT 2", "mysql"), ["SELECT 'it\\'s; ok'", "SELECT 2"]);
});

test("PostgreSQL dollar-quoted bodies are not split", () => {
  const sql = "CREATE FUNCTION f() RETURNS int AS $$ BEGIN RETURN 1; END; $$ LANGUAGE plpgsql; SELECT 2";
  assert.equal(texts(sql).length, 2);
  assert.equal(texts("SELECT $1; SELECT $2").length, 2); // positional parameters are not dollar quotes
});

test("SQL Server: [bracket] identifiers and GO batch separators", () => {
  assert.deepEqual(texts("SELECT [a;b] FROM t\nGO\nSELECT 2\ngo 3\n", "sqlserver"), ["SELECT [a;b] FROM t", "SELECT 2"]);
});

test("comment-only chunks and blank input produce no statements", () => {
  assert.deepEqual(texts("-- nothing\n/* here */\n;;"), []);
  assert.deepEqual(texts("   \n"), []);
});

test("leading comments are dropped and line numbers point at the first token", () => {
  const [stmt] = splitStatements("-- header\n/* multi\nline */\nSELECT 1", "postgresql");
  assert.equal(stmt.text, "SELECT 1");
  assert.equal(stmt.line, 4);
});

test("stripLiteralsAndComments blanks strings and comments but keeps keywords", () => {
  const out = stripLiteralsAndComments("DELETE FROM t -- where\n/* where */ WHERE x = 'where'");
  assert.equal(out.match(/\bwhere\b/gi).length, 1);
});
