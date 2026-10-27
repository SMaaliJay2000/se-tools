import { fixes } from "../fixes.js";

const f = (id, category, severity, title, detail, extra = {}) => ({ id, category, severity, title, detail, ...extra });

export function parseCsp(value) {
  const d = {};
  for (const part of value.split(";")) {
    const [name, ...vals] = part.trim().split(/\s+/);
    if (name && !(name.toLowerCase() in d)) d[name.toLowerCase()] = vals;
  }
  return d;
}

function checkCsp(ctx) {
  const out = [];
  const csp = ctx.h("content-security-policy");
  const report = ctx.h("content-security-policy-report-only");
  if (!csp) {
    if (report) {
      out.push(f("csp-report-only", "headers", "medium", "CSP is report-only",
        "Content-Security-Policy-Report-Only logs violations but blocks nothing. Promote it to an enforcing policy once the reports are clean.",
        { header: "Content-Security-Policy-Report-Only", value: report, fix: fixes.csp() }));
    } else {
      out.push(f("csp-missing", "headers", "high", "No Content-Security-Policy",
        "CSP is the strongest defence against XSS. Without it the browser will run any injected script.",
        { header: "Content-Security-Policy", fix: fixes.csp() }));
    }
    return out;
  }

  const d = parseCsp(csp);
  const scriptSrc = d["script-src"] || d["default-src"] || null;
  const issues = [];

  if (!scriptSrc) {
    out.push(f("csp-no-script-src", "headers", "medium", "CSP has no script-src or default-src",
      "Without either directive, scripts are not restricted at all.", { header: "Content-Security-Policy", value: csp, fix: fixes.csp() }));
  } else {
    const lower = scriptSrc.map((s) => s.toLowerCase());
    const hasNonceOrHash = lower.some((s) => s.startsWith("'nonce-") || s.startsWith("'sha256-") || s.startsWith("'sha384-") || s.startsWith("'sha512-"));
    const strictDynamic = lower.includes("'strict-dynamic'");
    if (lower.includes("'unsafe-inline'") && !hasNonceOrHash && !strictDynamic) {
      issues.push(f("csp-unsafe-inline", "headers", "high", "CSP allows 'unsafe-inline' scripts",
        "'unsafe-inline' in script-src lets injected inline scripts run, which defeats most of the policy. Use nonces or hashes instead.",
        { header: "Content-Security-Policy", value: csp, fix: fixes.csp() }));
    }
    if (lower.includes("'unsafe-eval'")) {
      issues.push(f("csp-unsafe-eval", "headers", "medium", "CSP allows 'unsafe-eval'",
        "eval() and similar sinks are permitted, which widens the XSS attack surface.",
        { header: "Content-Security-Policy", value: csp, fix: fixes.csp() }));
    }
    const wide = lower.filter((s) => s === "*" || s === "data:" || s === "http:" || s === "https:");
    if (wide.length && !strictDynamic) {
      issues.push(f("csp-wildcard", "headers", "high", "CSP script-src is too broad",
        `script-src allows ${wide.join(", ")}, so scripts can be loaded from almost anywhere. List the specific hosts you need.`,
        { header: "Content-Security-Policy", value: csp, fix: fixes.csp() }));
    }
  }

  const defaultNone = (d["default-src"] || []).map((s) => s.toLowerCase()).includes("'none'");
  if (!d["object-src"] && !defaultNone) {
    issues.push(f("csp-no-object-src", "headers", "low", "CSP is missing object-src",
      "Set object-src 'none' to block legacy plugin content (Flash, Java applets, embedded objects).",
      { header: "Content-Security-Policy", value: csp, fix: fixes.csp() }));
  }
  if (!d["base-uri"]) {
    issues.push(f("csp-no-base-uri", "headers", "low", "CSP is missing base-uri",
      "Without base-uri, an injected <base> tag can redirect every relative URL on the page to an attacker.",
      { header: "Content-Security-Policy", value: csp, fix: fixes.csp() }));
  }

  if (issues.length === 0) {
    out.push(f("csp-ok", "headers", "pass", "Content-Security-Policy is set and restrictive",
      "Scripts are restricted and no common weaknesses were found.", { header: "Content-Security-Policy", value: csp }));
  }
  return [...out, ...issues];
}

function checkHsts(ctx) {
  if (!ctx.https) return [];
  const v = ctx.h("strict-transport-security");
  if (!v) {
    return [f("hsts-missing", "headers", "high", "No Strict-Transport-Security",
      "Browsers may still connect over plain HTTP first, which allows downgrade and SSL-stripping attacks.",
      { header: "Strict-Transport-Security", fix: fixes.hsts() })];
  }
  const maxAge = Number((/max-age=(\d+)/i.exec(v) || [])[1] ?? 0);
  const sub = /includeSubDomains/i.test(v);
  const preload = /preload/i.test(v);
  if (maxAge < 15552000) {
    return [f("hsts-short", "headers", "medium", "HSTS max-age is too short",
      `max-age is ${maxAge} seconds (${Math.round(maxAge / 86400)} days). Use at least 31536000 (1 year).`,
      { header: "Strict-Transport-Security", value: v, fix: fixes.hsts() })];
  }
  if (maxAge < 31536000 || !sub) {
    const parts = [];
    if (maxAge < 31536000) parts.push("raise max-age to at least 31536000 (1 year)");
    if (!sub) parts.push("add includeSubDomains once every subdomain supports HTTPS");
    return [f("hsts-weak", "headers", "low", "HSTS can be stronger", `To harden it: ${parts.join(" and ")}.`,
      { header: "Strict-Transport-Security", value: v, fix: fixes.hsts() })];
  }
  return [f("hsts-ok", "headers", "pass", "HSTS is enabled",
    preload ? "max-age is at least a year with includeSubDomains and preload." : "max-age is at least a year with includeSubDomains. Add preload only if you plan to submit the domain to the preload list.",
    { header: "Strict-Transport-Security", value: v })];
}

function checkFraming(ctx) {
  const xfo = ctx.h("x-frame-options");
  const csp = ctx.h("content-security-policy");
  const hasFrameAncestors = csp && "frame-ancestors" in parseCsp(csp);
  if (hasFrameAncestors) {
    return [f("framing-ok", "headers", "pass", "Clickjacking protection via frame-ancestors",
      "CSP frame-ancestors controls who can embed this page.", { header: "Content-Security-Policy", value: csp })];
  }
  if (!xfo) {
    return [f("xfo-missing", "headers", "medium", "No clickjacking protection",
      "Neither X-Frame-Options nor CSP frame-ancestors is set, so any site can embed this page in an iframe.",
      { header: "X-Frame-Options", fix: fixes.xfo() })];
  }
  const val = xfo.trim().toUpperCase();
  if (val === "DENY" || val === "SAMEORIGIN") {
    return [f("framing-ok", "headers", "pass", "X-Frame-Options is set", `Framing is restricted (${val}).`, { header: "X-Frame-Options", value: xfo })];
  }
  return [f("xfo-invalid", "headers", "low", "X-Frame-Options has an unsupported value",
    "ALLOW-FROM is obsolete and ignored by modern browsers. Use DENY, SAMEORIGIN, or CSP frame-ancestors.",
    { header: "X-Frame-Options", value: xfo, fix: fixes.xfo() })];
}

function checkNosniff(ctx) {
  const v = ctx.h("x-content-type-options");
  if (!v) {
    return [f("xcto-missing", "headers", "medium", "No X-Content-Type-Options",
      "Browsers may guess a file's type and run uploaded content as script. Set it to nosniff.",
      { header: "X-Content-Type-Options", fix: fixes.xcto() })];
  }
  if (v.trim().toLowerCase() !== "nosniff") {
    return [f("xcto-invalid", "headers", "medium", "X-Content-Type-Options is invalid",
      "The only valid value is nosniff.", { header: "X-Content-Type-Options", value: v, fix: fixes.xcto() })];
  }
  return [f("xcto-ok", "headers", "pass", "X-Content-Type-Options is nosniff", "MIME sniffing is disabled.", { header: "X-Content-Type-Options", value: v })];
}

function checkReferrer(ctx) {
  const v = ctx.h("referrer-policy");
  if (!v) {
    return [f("referrer-missing", "headers", "low", "No Referrer-Policy",
      "Full URLs, including query strings, may be sent to other sites. Set strict-origin-when-cross-origin or stricter.",
      { header: "Referrer-Policy", fix: fixes.referrer() })];
  }
  const last = v.split(",").pop().trim().toLowerCase();
  if (last === "unsafe-url" || last === "no-referrer-when-downgrade") {
    return [f("referrer-weak", "headers", "low", "Referrer-Policy leaks full URLs",
      `${last} sends the full URL to other origins. Use strict-origin-when-cross-origin or stricter.`,
      { header: "Referrer-Policy", value: v, fix: fixes.referrer() })];
  }
  return [f("referrer-ok", "headers", "pass", "Referrer-Policy is set", "Cross-origin referrer leakage is limited.", { header: "Referrer-Policy", value: v })];
}

function checkPermissions(ctx) {
  const v = ctx.h("permissions-policy");
  if (!v) {
    return [f("permissions-missing", "headers", "low", "No Permissions-Policy",
      "Browser features such as camera, microphone and geolocation aren't explicitly restricted for this page or its iframes.",
      { header: "Permissions-Policy", fix: fixes.permissions() })];
  }
  return [f("permissions-ok", "headers", "pass", "Permissions-Policy is set", "Browser features are explicitly restricted.", { header: "Permissions-Policy", value: v })];
}

function checkIsolation(ctx) {
  const names = ["cross-origin-opener-policy", "cross-origin-resource-policy", "cross-origin-embedder-policy"];
  const missing = names.filter((n) => !ctx.h(n));
  if (missing.length === 0) {
    return [f("isolation-ok", "headers", "pass", "Cross-origin isolation headers are set", "COOP, CORP and COEP are all present.")];
  }
  return [f("isolation-missing", "headers", "info", "Cross-origin isolation headers not set",
    `Missing: ${missing.join(", ")}. COOP and CORP are safe, low-effort wins. COEP require-corp can break third-party embeds, so test it first.`,
    { fix: fixes.isolation() })];
}

function checkLegacy(ctx) {
  const v = ctx.h("x-xss-protection");
  if (v && /^\s*1/.test(v)) {
    return [f("xxss-enabled", "headers", "low", "X-XSS-Protection is enabled",
      "The old XSS auditor was removed from modern browsers and could itself introduce vulnerabilities in old ones. Set it to 0 or remove it.",
      { header: "X-XSS-Protection", value: v, fix: fixes.xxss() })];
  }
  return [];
}

function checkDisclosure(ctx) {
  const found = [];
  const server = ctx.h("server");
  if (server && /\d+(\.\d+)+/.test(server)) found.push(`Server: ${server}`);
  for (const n of ["x-powered-by", "x-aspnet-version", "x-aspnetmvc-version"]) {
    const v = ctx.h(n);
    if (v) found.push(`${n}: ${v}`);
  }
  if (found.length === 0) {
    return [f("disclosure-ok", "disclosure", "pass", "No version information leaked", "Server and framework versions are not exposed in headers.")];
  }
  return [f("disclosure", "disclosure", "low", "Server technology is exposed",
    "Version banners help attackers pick known exploits. Remove them.",
    { value: found.join("\n"), fix: fixes.disclosure() })];
}

export function checkHeaders(ctx) {
  return [
    ...checkCsp(ctx),
    ...checkHsts(ctx),
    ...checkFraming(ctx),
    ...checkNosniff(ctx),
    ...checkReferrer(ctx),
    ...checkPermissions(ctx),
    ...checkIsolation(ctx),
    ...checkLegacy(ctx),
    ...checkDisclosure(ctx),
  ];
}
