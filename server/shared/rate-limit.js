// Best-effort per-IP limiter. Serverless instances don't share memory, so use
// Vercel Firewall or Upstash if you need hard limits.

export function clientIp(req) {
  return (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

/** Fixed-window limiter. Each call returns an independent middleware with its own counters. */
export function createRateLimiter({ windowMs = 60_000, max, message }) {
  const hits = new Map();
  return function rateLimit(req, res, next) {
    const now = Date.now();
    const ip = clientIp(req);
    const entry = hits.get(ip);
    if (!entry || now - entry.start > windowMs) {
      hits.set(ip, { start: now, count: 1 });
    } else if (++entry.count > max) {
      res.setHeader("Retry-After", Math.ceil((entry.start + windowMs - now) / 1000));
      return res.status(429).json({ error: message });
    }
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
    next();
  };
}

/** Caps simultaneous in-flight requests on this instance; for CPU-heavy handlers where queueing would only add latency. */
export function limitConcurrency({ max, message }) {
  let active = 0;
  return function concurrencyLimit(_req, res, next) {
    if (active >= max) return res.status(429).json({ error: message });
    active++;
    let done = false;
    const release = () => {
      if (!done) {
        done = true;
        active--;
      }
    };
    res.on("finish", release);
    res.on("close", release);
    next();
  };
}
