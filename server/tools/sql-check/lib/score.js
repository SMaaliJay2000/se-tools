import { computeScore, gradeFor } from "../../../shared/score.js";

/** Plain-language "optimization level" shown next to the grade. */
export function levelFor(grade, hasCritical) {
  if (hasCritical) return "Dangerous";
  if (grade === "A+" || grade === "A") return "Well optimized";
  if (grade === "B") return "Good";
  if (grade === "C") return "Needs work";
  if (grade === "D") return "Poor";
  return "Problematic";
}

/** A statement that doesn't parse can't be "well optimized": cap it so a lone syntax error never reads as Good. */
export function scoreStatement(findings, { parsed = true } = {}) {
  const score = computeScore(findings);
  if (!parsed) {
    const value = Math.min(score.value, 50);
    return { ...score, value, grade: gradeFor(value), level: "Does not parse" };
  }
  return { ...score, level: levelFor(score.grade, score.counts.critical > 0) };
}

/** Overall = rounded mean of the statement scores (a long script of fine queries shouldn't be dragged down by one), still capped by any critical finding. */
export function scoreOverall(statementScores) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, pass: 0 };
  for (const s of statementScores) for (const k of Object.keys(counts)) counts[k] += s.counts[k];
  if (statementScores.length === 0) return { value: 100, grade: "A+", counts, level: "Nothing to optimize" };

  let value = Math.round(statementScores.reduce((n, s) => n + s.value, 0) / statementScores.length);
  if (counts.critical > 0) value = Math.min(value, 40);
  const grade = gradeFor(value);
  return { value, grade, counts, level: levelFor(grade, counts.critical > 0) };
}
