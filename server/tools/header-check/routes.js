import express, { Router } from "express";
import { createRateLimiter } from "../../shared/rate-limit.js";
import { analyze, ScanError } from "./lib/analyze.js";

const router = Router();
router.use(express.json({ limit: "10kb" }));

const rateLimit = createRateLimiter({ max: 20, message: "Too many scans. Wait a minute and try again." });

router.post("/analyze", rateLimit, async (req, res) => {
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

export default router;
