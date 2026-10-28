import express, { Router } from "express";
import { createRateLimiter, limitConcurrency } from "../../shared/rate-limit.js";
import { analyzeSql } from "./lib/analyze.js";
import { DIALECTS, LIMITS } from "./lib/dialects.js";
import { SqlCheckError } from "./lib/errors.js";

const router = Router();
router.use(express.json({ limit: "512kb" }));
router.use(createRateLimiter({ max: 60, message: "Too many requests. Wait a minute and try again." }));

// Parsing is synchronous CPU work, so cap how many analyses run at once on one instance.
const analyzeGuards = [limitConcurrency({ max: 4, message: "The server is busy analyzing. Try again in a moment." })];

const invalid = (message) => new SqlCheckError("invalid_input", message);

function text(body, name, { max, required }) {
  const v = body?.[name];
  if (v === undefined || v === null || v === "") {
    if (required) throw invalid(`${name} is required.`);
    return undefined;
  }
  if (typeof v !== "string") throw invalid(`${name} must be a string.`);
  if (v.length > max) throw new SqlCheckError("too_long", `${name} is too long (max ${max.toLocaleString("en-US")} characters).`);
  return v;
}

router.get("/options", (_req, res) => res.json({ dialects: DIALECTS.map(({ id, label }) => ({ id, label })), limits: LIMITS }));

router.post("/analyze", analyzeGuards, (req, res) => {
  try {
    res.setHeader("Cache-Control", "no-store");
    const body = req.body ?? {};
    const sql = text(body, "sql", { max: LIMITS.maxSqlChars, required: true });
    const schema = text(body, "schema", { max: LIMITS.maxSchemaChars });
    res.json(analyzeSql({ sql, dialect: body.dialect ?? "postgresql", schema }));
  } catch (e) {
    if (e instanceof SqlCheckError) return res.status(e.status).json({ error: e.message, code: e.code });
    console.error(e);
    res.status(500).json({ error: "Something went wrong while analyzing. Try again." });
  }
});

export default router;
