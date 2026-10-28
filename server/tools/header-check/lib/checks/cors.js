import net from "node:net";
import { fixes } from "../fixes.js";

const EVIL = "https://evil.example";
const first = (headers, name) => headers[name]?.[0] ?? null;
const varyHasOrigin = (vary) => !!vary && /(^|[\s,])(origin|\*)([\s,]|$)/i.test(vary);

function buildProbes(host, testOrigin) {
  const isIp = net.isIP(host.replace(/^\[|\]$/g, "")) !== 0;
  const probes = [
    { key: "evil", label: "Arbitrary origin", origin: EVIL, method: "GET" },
    { key: "evil-preflight", label: "Arbitrary origin (preflight)", origin: EVIL, method: "OPTIONS" },
    { key: "null", label: "Null origin", origin: "null", method: "GET" },
  ];
  if (!isIp) {
    probes.push(
      { key: "prefix", label: "Prefix bypass", origin: `https://${host}.evil.example`, method: "GET" },
      { key: "suffix", label: "Suffix bypass", origin: `https://evil${host}`, method: "GET" }
    );
  }
  if (testOrigin) {
    probes.push(
      { key: "test", label: "Your origin", origin: testOrigin, method: "GET" },
      { key: "test-preflight", label: "Your origin (preflight)", origin: testOrigin, method: "OPTIONS" }
    );
  }
  return probes;
}

async function runProbe(p, send) {
  const headers = { origin: p.origin };
  if (p.method === "OPTIONS") {
    headers["access-control-request-method"] = "PUT";
    headers["access-control-request-headers"] = "authorization,content-type";
    headers["access-control-request-private-network"] = "true";
  }
  try {
    const r = await send(p.method, headers);
    const h = r.headers;
    return {
      ...p,
      status: r.status,
      acao: first(h, "access-control-allow-origin"),
      acac: first(h, "access-control-allow-credentials"),
      vary: h["vary"] ? h["vary"].join(", ") : null,
      methods: first(h, "access-control-allow-methods"),
      allowHeaders: first(h, "access-control-allow-headers"),
      maxAge: first(h, "access-control-max-age"),
      pna: first(h, "access-control-allow-private-network"),
      error: null,
    };
  } catch (e) {
    return { ...p, status: null, acao: null, acac: null, vary: null, methods: null, allowHeaders: null, maxAge: null, pna: null, error: e.code || e.message };
  }
}

const allowed = (r) => !!r && !!r.acao && (r.acao === "*" || r.acao === r.origin);
const echoed = (r) => !!r && !!r.acao && r.acao === r.origin;
const withCreds = (r) => !!r && r.acac === "true";

export async function checkCors(ctx, { testOrigin, send }) {
  const probes = buildProbes(ctx.url.hostname, testOrigin);
  const rows = await Promise.all(probes.map((p) => runProbe(p, send)));
  const by = Object.fromEntries(rows.map((r) => [r.key, r]));
  const findings = [];
  const fix = fixes.cors(testOrigin || "https://app.example.com");
  const add = (id, severity, title, detail, extra = {}) =>
    findings.push({ id, category: "cors", severity, title, detail, ...extra });

  if (rows.every((r) => r.error)) {
    add("cors-unreachable", "info", "CORS probes failed", `The server did not answer the CORS test requests (${rows[0].error}).`);
    return { findings, probes: rows };
  }

  const evilHits = [by.evil, by["evil-preflight"]].filter(echoed);
  const evilStar = [by.evil, by["evil-preflight"]].filter((r) => r && r.acao === "*");
  let flagged = false;

  if (evilHits.length) {
    flagged = true;
    const creds = evilHits.some(withCreds);
    add(
      creds ? "cors-reflect-credentials" : "cors-reflect-any",
      creds ? "critical" : "medium",
      creds ? "Any origin is trusted, with credentials" : "Any origin is trusted",
      creds
        ? `The server echoes whatever Origin it receives and sets Access-Control-Allow-Credentials: true. Any website a logged-in user visits can read authenticated responses. Replace the echo with an explicit allowlist.`
        : `The server echoes whatever Origin it receives. Any website can read responses from this URL. This is only safe for fully public data. Replace the echo with an explicit allowlist.`,
      { header: "Access-Control-Allow-Origin", value: evilHits[0].acao, fix }
    );
  } else if (evilStar.length) {
    const creds = evilStar.some(withCreds);
    add(
      creds ? "cors-wildcard-credentials" : "cors-wildcard",
      creds ? "medium" : "low",
      creds ? "Wildcard origin combined with credentials" : "Wildcard CORS origin",
      creds
        ? "Access-Control-Allow-Origin: * together with Allow-Credentials: true is invalid and browsers reject it. It signals a confused configuration. Use an explicit origin allowlist."
        : "Access-Control-Allow-Origin: * lets any site read this response. That's fine for public APIs and assets, but not for anything that depends on cookies or tokens.",
      { header: "Access-Control-Allow-Origin", value: "*", fix }
    );
    flagged = !!creds;
  }

  if (!evilHits.length && echoed(by.null)) {
    flagged = true;
    const creds = withCreds(by.null);
    add("cors-null-origin", creds ? "high" : "medium", "The null origin is trusted",
      "Sandboxed iframes and local files send Origin: null, so any attacker page can obtain it. Never allowlist null.",
      { header: "Access-Control-Allow-Origin", value: "null", fix });
  }

  if (!evilHits.length) {
    const bypass = [by.prefix, by.suffix].filter(echoed);
    if (bypass.length) {
      flagged = true;
      const creds = bypass.some(withCreds);
      add("cors-origin-bypass", creds ? "critical" : "high", "Origin validation can be bypassed",
        `The server accepted ${bypass.map((b) => b.origin).join(" and ")}. The check looks like a prefix, suffix or unanchored regex match, so an attacker can register a matching domain. Compare against an exact allowlist.`,
        { header: "Access-Control-Allow-Origin", value: bypass[0].acao, fix });
    }
  }

  const echoRows = rows.filter(echoed);
  if (echoRows.length && echoRows.some((r) => !varyHasOrigin(r.vary))) {
    add("cors-vary-missing", "medium", "Dynamic CORS response lacks Vary: Origin",
      "The allowed origin changes per request, but the response isn't marked Vary: Origin. A shared cache can store one origin's answer and serve it to others.",
      { header: "Vary", value: echoRows.find((r) => !varyHasOrigin(r.vary))?.vary ?? "(not set)", fix: fixes.vary() });
  }

  const pre = [by["evil-preflight"], by["test-preflight"]].filter(allowed);
  if (pre.some((r) => (r.pna || "").toLowerCase() === "true")) {
    add("cors-private-network", "medium", "Private network access is allowed",
      "Access-Control-Allow-Private-Network: true lets public websites reach devices on the visitor's local network.",
      { header: "Access-Control-Allow-Private-Network", value: "true" });
  }
  if (pre.some((r) => r.allowHeaders?.trim() === "*") && !evilHits.length) {
    add("cors-allow-headers-wildcard", "low", "Preflight allows all request headers",
      "Access-Control-Allow-Headers: * is broader than needed. List the headers your frontend sends.",
      { header: "Access-Control-Allow-Headers", value: "*", fix });
  }

  if (!flagged) {
    const anyAcao = rows.filter((r) => r.key !== "test" && r.key !== "test-preflight").some(allowed);
    add("cors-restricted", "pass",
      anyAcao ? "CORS is restricted" : "Cross-origin access is closed to other sites",
      anyAcao
        ? "Untrusted origins were not granted access."
        : "No CORS headers were returned to foreign origins, so browsers block cross-origin reads. This is the secure default.");
  }

  if (testOrigin) {
    const g = by.test, p = by["test-preflight"];
    const ok = allowed(g) || allowed(p);
    if (ok) {
      const src = allowed(p) ? p : g;
      const bits = [
        `Allow-Origin: ${src.acao}`,
        src.acac ? `Allow-Credentials: ${src.acac}` : null,
        p?.methods ? `Methods: ${p.methods}` : null,
        p?.allowHeaders ? `Headers: ${p.allowHeaders}` : null,
        p?.maxAge ? `Max-Age: ${p.maxAge}s` : "Max-Age not set, so every call is preceded by a preflight",
      ].filter(Boolean);
      add("cors-test-allowed", "pass", `${testOrigin} is allowed`, bits.join("\n"), {});
    } else {
      add("cors-test-blocked", "info", `${testOrigin} is not allowed`,
        `Browsers will block calls from this origin. The server returned ${g?.acao ? `Allow-Origin: ${g.acao}` : "no Access-Control-Allow-Origin"} (preflight status ${p?.status ?? "n/a"}). Add the origin to your allowlist.`,
        { fix });
    }
  }

  return { findings, probes: rows };
}
