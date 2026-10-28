import { correctnessRules } from "./correctness.js";
import { performanceRules } from "./performance.js";
import { safetyRules } from "./safety.js";
import { schemaRules } from "./schema.js";

// A rule is { id, category, severity, title, applies?, needsSchema?, pass?: { title, when(ctx) }, run(ctx) -> hit[] }.
// A hit is { detail, fix, snippet?, severity?, title?, id? } (id/severity/title override the rule's own for that finding).
// When run() returns nothing and the rule has a `pass`, a pass finding is emitted if pass.when(ctx) holds.
export const RULES = [...safetyRules, ...correctnessRules, ...performanceRules, ...schemaRules];

/** ctx = { ast, kind, dialect, text, schema|null, selects, cteNames } -> findings (without statement/line, added by the caller). */
export function runRules(ctx) {
  const findings = [];
  for (const rule of RULES) {
    if (rule.applies && !rule.applies.includes(ctx.kind)) continue;
    if (rule.needsSchema && !ctx.schema) continue;
    const hits = rule.run(ctx) ?? [];
    if (hits.length === 0) {
      if (rule.pass?.when(ctx)) findings.push({ id: rule.id, category: rule.category, severity: "pass", title: rule.pass.title, detail: "" });
      continue;
    }
    for (const h of hits) {
      findings.push({
        id: h.id ?? rule.id,
        category: rule.category,
        severity: h.severity ?? rule.severity,
        title: h.title ?? rule.title,
        detail: h.detail,
        ...(h.snippet ? { snippet: h.snippet } : {}),
        ...(h.fix ? { fix: h.fix } : {}),
      });
    }
  }
  return findings;
}
