import { fixes } from "../fixes.js";

const SESSION_LIKE = /sess|auth|token|jwt|sid|login|csrf|xsrf/i;
const RANK = { low: 1, medium: 2, high: 3 };

export function parseSetCookie(line) {
  const [pair, ...attrs] = line.split(";").map((s) => s.trim());
  const eq = pair.indexOf("=");
  const name = eq === -1 ? pair : pair.slice(0, eq);
  const flags = { secure: false, httpOnly: false, sameSite: null, path: null, domain: null };
  for (const a of attrs) {
    const [k, ...v] = a.split("=");
    const key = k.trim().toLowerCase();
    const val = v.join("=").trim();
    if (key === "secure") flags.secure = true;
    else if (key === "httponly") flags.httpOnly = true;
    else if (key === "samesite") flags.sameSite = val.toLowerCase();
    else if (key === "path") flags.path = val;
    else if (key === "domain") flags.domain = val;
  }
  return { name, ...flags };
}

export function checkCookies(ctx) {
  const lines = ctx.cookies;
  if (lines.length === 0) {
    return [{
      id: "cookies-none", category: "cookies", severity: "pass", title: "No cookies set on this response",
      detail: "Cookies are often issued only after login or on API routes, so scan those URLs too.",
    }];
  }
  const cookies = lines.map(parseSetCookie);
  const buckets = { secure: [], httpOnly: [], sameSite: [], none: [], prefix: [] };
  const worst = { secure: 0, httpOnly: 0 };

  for (const c of cookies) {
    const sensitive = SESSION_LIKE.test(c.name);
    if (ctx.https && !c.secure) {
      buckets.secure.push(c.name);
      worst.secure = Math.max(worst.secure, sensitive ? RANK.high : RANK.medium);
    }
    if (!c.httpOnly) {
      buckets.httpOnly.push(c.name);
      worst.httpOnly = Math.max(worst.httpOnly, sensitive ? RANK.high : RANK.medium);
    }
    if (!c.sameSite) buckets.sameSite.push(c.name);
    if (c.sameSite === "none") buckets.none.push(c.name + (c.secure ? "" : " (no Secure flag, browsers reject it)"));
    if (c.name.startsWith("__Host-") && (!c.secure || c.path !== "/" || c.domain)) buckets.prefix.push(c.name);
  }

  const sev = (n) => (n >= 3 ? "high" : "medium");
  const out = [];
  const add = (id, severity, title, detail, names) =>
    out.push({ id, category: "cookies", severity, title, detail, value: names.join("\n"), fix: fixes.cookies() });

  if (buckets.secure.length)
    add("cookie-secure-missing", sev(worst.secure), "Cookies missing the Secure flag",
      "These cookies can be sent over plain HTTP, where anyone on the network can read them.", buckets.secure);
  if (buckets.httpOnly.length)
    add("cookie-httponly-missing", sev(worst.httpOnly), "Cookies missing the HttpOnly flag",
      "JavaScript can read these cookies, so any XSS bug can steal them.", buckets.httpOnly);
  if (buckets.sameSite.length)
    add("cookie-samesite-missing", "low", "Cookies without a SameSite attribute",
      "Browsers default to Lax, but setting it explicitly protects older clients and documents your intent.", buckets.sameSite);
  if (buckets.none.length)
    add("cookie-samesite-none", "low", "Cookies with SameSite=None",
      "These are sent on all cross-site requests. Make sure the app has CSRF protection.", buckets.none);
  if (buckets.prefix.length)
    add("cookie-prefix-invalid", "medium", "__Host- cookies break the prefix rules",
      "__Host- cookies must be Secure, have Path=/ and no Domain attribute, otherwise browsers reject them.", buckets.prefix);

  if (out.length === 0) {
    out.push({
      id: "cookies-ok", category: "cookies", severity: "pass", title: "Cookie flags look good",
      detail: `${cookies.length} cookie(s) set with Secure, HttpOnly and SameSite.`, value: cookies.map((c) => c.name).join("\n"),
    });
  }
  return out;
}
