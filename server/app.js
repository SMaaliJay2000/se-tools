import express from "express";
import { tools } from "./tools/index.js";

const app = express();
app.disable("x-powered-by");

app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Each tool installs its own body parser and rate limits, so limits fit the tool.
for (const { id, router } of tools) app.use(`/api/${id}`, router);

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// JSON errors for everything the routers don't handle themselves (bad JSON, oversized bodies).
app.use((err, _req, res, _next) => {
  if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "Request body is not valid JSON." });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "Request body is too large." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Try again." });
});

export default app;
