import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSql } from "../../server/tools/sql-check/lib/analyze.js";
import { levelFor, scoreOverall, scoreStatement } from "../../server/tools/sql-check/lib/score.js";

const f = (severity) => ({ severity });

test("statement score uses the shared penalties and a critical caps the grade at F", () => {
  assert.equal(scoreStatement([]).grade, "A+");
  const s = scoreStatement([f("medium"), f("low")]);
  assert.equal(s.value, 89);
  assert.equal(s.grade, "B");
  assert.equal(s.level, "Good");
  const critical = scoreStatement([f("critical")]);
  assert.equal(critical.value, 40);
  assert.equal(critical.level, "Dangerous");
});

test("a statement that does not parse is capped so it never reads as Good", () => {
  const s = scoreStatement([f("high")], { parsed: false });
  assert.ok(s.value <= 50);
  assert.equal(s.level, "Does not parse");
});

test("overall is the mean of statement scores, but any critical caps it at 40", () => {
  const good = scoreStatement([]);
  const mid = scoreStatement([f("medium"), f("medium"), f("medium")]); // 76
  assert.equal(scoreOverall([good, mid]).value, 88);

  const bad = scoreStatement([f("critical")]);
  const overall = scoreOverall([good, good, good, bad]);
  assert.equal(overall.value, 40);
  assert.equal(overall.counts.critical, 1);
  assert.equal(overall.grade, "F");
});

test("overall of nothing analyzable is a clean A+", () => {
  assert.equal(scoreOverall([]).grade, "A+");
  const r = analyzeSql({ sql: "CREATE TABLE t (id INT)", dialect: "postgresql" });
  assert.equal(r.score.grade, "A+");
  assert.equal(r.statements[0].analyzed, false);
});

test("levelFor maps grades to plain-language levels", () => {
  assert.deepEqual(["A+", "A", "B", "C", "D", "F"].map((g) => levelFor(g, false)), ["Well optimized", "Well optimized", "Good", "Needs work", "Poor", "Problematic"]);
});
