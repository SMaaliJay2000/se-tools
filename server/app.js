import express from "express";
import { analyze, ScanError } from "./lib/analyze.js";

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "10kb" }));

// Best-effort per-IP limiter. Serverless instances don't share memory, so use
// Vercel Firewall or Upstash if you need hard limits.
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
const hits = new Map();

function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

function rateLimit(req, res, next) {
  const now = Date.now();
  const ip = clientIp(req);
  const entry = hits.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) {
    hits.set(ip, { start: now, count: 1 });
  } else if (++entry.count > MAX_PER_WINDOW) {
    res.setHeader("Retry-After", Math.ceil((entry.start + WINDOW_MS - now) / 1000));
    return res.status(429).json({ error: "Too many scans. Wait a minute and try again." });
  }
  if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > WINDOW_MS) hits.delete(k);
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/analyze", rateLimit, async (req, res) => {
  const { url, origin } = req.body || {};
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json(await analyze(url, { origin }));
  } catch (e) {
    if (e instanceof ScanError) return res.status(e.status).json({ error: e.message });
    if (e && e.name === "BlockedTargetError") return res.status(400).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: "Something went wrong while scanning. Try again." });
  }
});

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

export default app;
