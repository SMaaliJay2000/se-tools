import { BlockedTargetError, fetchChain, request, validateTarget } from "./ssrf.js";
import { checkHeaders } from "./checks/headers.js";
import { checkCookies } from "./checks/cookies.js";
import { checkCors } from "./checks/cors.js";
import { computeScore } from "./score.js";
import { fixes } from "./fixes.js";

export class ScanError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = "ScanError";
    this.status = status;
  }
}

const CERT_ERR = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME|HOSTNAME_MISMATCH/;

export function normalizeInput(input) {
  let s = String(input || "").trim();
  if (!s) throw new BlockedTargetError("Enter a URL to scan.");
  if (s.length > 2048) throw new BlockedTargetError("That URL is too long.");
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = "https://" + s;
  return validateTarget(s).href;
}

function friendly(e) {
  if (e instanceof BlockedTargetError) return new ScanError(e.message, 400);
  switch (e.code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return new ScanError("DNS lookup failed. Check the hostname for typos.");
    case "ECONNREFUSED":
      return new ScanError("The server refused the connection.");
    case "ETIMEDOUT":
      return new ScanError("The server took too long to respond (8s limit).");
    case "ECONNRESET":
      return new ScanError("The connection was reset by the server.");
    default:
      return new ScanError(`Could not reach the site (${e.code || e.message}).`);
  }
}

export async function analyze(input, { origin } = {}) {
  const started = Date.now();
  let target;
  try {
    target = normalizeInput(input);
  } catch (e) {
    throw friendly(e);
  }
  let testOrigin = null;
  if (origin && String(origin).trim()) {
    try {
      const o = new URL(String(origin).trim());
      if (!/^https?:$/.test(o.protocol)) throw new Error();
      testOrigin = o.origin;
    } catch {
      throw new ScanError("The frontend origin must look like https://app.example.com.", 400);
    }
  }

  let insecure = false;
  let tlsError = null;
  let result;
  try {
    result = await fetchChain(target);
  } catch (e) {
    if (CERT_ERR.test(e.code || "")) {
      tlsError = e.code;
      insecure = true;
      try {
        result = await fetchChain(target, { insecure: true });
      } catch (e2) {
        throw friendly(e2);
      }
    } else {
      throw friendly(e);
    }
  }

  const { res, chain, finalUrl } = result;
  const ctx = {
    url: finalUrl,
    https: finalUrl.protocol === "https:",
    status: res.status,
    cookies: res.headers["set-cookie"] || [],
    h: (name) => (res.headers[name.toLowerCase()] ? res.headers[name.toLowerCase()].join(", ") : undefined),
  };

  const findings = [];

  // Transport
  if (!ctx.https) {
    findings.push({
      id: "transport-http", category: "transport", severity: "high", title: "Served over plain HTTP",
      detail: "Traffic can be read and modified in transit. Serve the site over HTTPS and redirect all HTTP requests to it.",
      value: finalUrl.href, fix: fixes.https(),
    });
  } else {
    if (tlsError) {
      findings.push({
        id: "tls-invalid", category: "transport", severity: "high", title: "TLS certificate failed validation",
        detail: "Browsers will show a full-page warning. The headers below were still read with validation turned off.",
        value: tlsError,
      });
    }
    const t = res.tls;
    if (t && t.daysLeft !== null && !tlsError) {
      if (t.daysLeft < 0) {
        findings.push({ id: "tls-expired", category: "transport", severity: "high", title: "TLS certificate has expired", detail: `Expired ${-t.daysLeft} day(s) ago.`, value: t.validTo });
      } else if (t.daysLeft < 14) {
        findings.push({ id: "tls-expiring", category: "transport", severity: "medium", title: "TLS certificate expires soon", detail: `${t.daysLeft} day(s) left. Check that auto-renewal works.`, value: t.validTo });
      }
    }
    if (t && (t.protocol === "TLSv1" || t.protocol === "TLSv1.1")) {
      findings.push({ id: "tls-old", category: "transport", severity: "high", title: "Outdated TLS version", detail: `The server negotiated ${t.protocol}. Require TLS 1.2 or newer.`, value: t.protocol });
    }
    if (findings.filter((x) => x.category === "transport").length === 0) {
      findings.push({
        id: "transport-ok", category: "transport", severity: "pass", title: "HTTPS with a valid certificate",
        detail: t ? `${t.protocol || "TLS"}${t.daysLeft !== null ? `, certificate valid for ${t.daysLeft} more day(s)` : ""}.` : "Connection is encrypted.",
      });
    }
  }
  if (chain.some((c, i) => i > 0 && chain[i - 1].url.startsWith("https:") && c.url.startsWith("http:"))) {
    findings.push({
      id: "transport-downgrade", category: "transport", severity: "high", title: "Redirect downgrades HTTPS to HTTP",
      detail: "A redirect sends visitors from an HTTPS URL to a plain HTTP one.", value: chain.map((c) => c.url).join("\n"),
    });
  }

  findings.push(...checkHeaders(ctx));
  findings.push(...checkCookies(ctx));

  // CORS probes go to the final URL, with the same TLS settings as the main scan.
  const cors = await checkCors(ctx, {
    testOrigin,
    send: (method, headers) => request(finalUrl, { method, headers, insecure, timeoutMs: 6000 }),
  });
  findings.push(...cors.findings);

  return {
    url: target,
    finalUrl: finalUrl.href,
    status: res.status,
    statusText: res.statusText,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
    chain,
    headers: res.pairs,
    tls: res.tls,
    tlsError,
    findings,
    score: computeScore(findings),
    cors: { probes: cors.probes, testOrigin },
  };
}
