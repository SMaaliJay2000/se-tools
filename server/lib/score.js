const PENALTY = { critical: 30, high: 15, medium: 8, low: 3, info: 0, pass: 0 };

export function gradeFor(value) {
  if (value >= 97) return "A+";
  if (value >= 90) return "A";
  if (value >= 80) return "B";
  if (value >= 65) return "C";
  if (value >= 50) return "D";
  return "F";
}

export function computeScore(findings) {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0, pass: 0 };
  let value = 100;
  for (const f of findings) {
    counts[f.severity]++;
    value -= PENALTY[f.severity] ?? 0;
  }
  value = Math.max(0, value);
  if (counts.critical > 0) value = Math.min(value, 40); // a critical flaw can't hide behind good headers
  return { value, grade: gradeFor(value), counts };
}
