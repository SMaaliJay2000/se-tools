# Header Check

CORS and security header analyzer. React + Vite + TypeScript frontend, Express API, deploys to Vercel as-is.

## What it checks

| Area | Checks |
| --- | --- |
| HTTPS | Plain HTTP, HTTPS to HTTP redirect downgrade, invalid/expired/expiring certificate, TLS 1.0/1.1 |
| Headers | CSP (missing, report-only, `unsafe-inline`, `unsafe-eval`, wildcards, `object-src`, `base-uri`), HSTS, X-Frame-Options / `frame-ancestors`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP/CORP/COEP, legacy X-XSS-Protection |
| Cookies | `Secure`, `HttpOnly`, `SameSite`, `SameSite=None`, `__Host-` prefix rules. Session-like names are rated higher |
| CORS | Reflected arbitrary origin, reflection with credentials, `*` (with and without credentials), `null` origin, prefix/suffix origin bypass, missing `Vary: Origin`, private network access, permissive preflight headers |
| Disclosure | `Server` version, `X-Powered-By`, `X-AspNet-Version` |

Every finding has a copy-paste fix for **Express, ASP.NET Core, nginx and IIS**. Enter your frontend origin to see whether the target allows it, and which methods, headers and max-age it returns.

Extras: A+ to F grade, redirect chain, raw response headers, CORS probe table, JSON export, scan history (browser localStorage only), and a staging vs production **Compare** view.

## Run locally

```bash
npm install
npm run dev        # API on :3001, Vite on :5173 (proxies /api)
npm test           # SSRF guard + analyzer tests
```

To scan servers on your own machine (for example `http://localhost:5000`), start the API with the guard relaxed. **Development only:**

```bash
ALLOW_PRIVATE_TARGETS=true npm run dev
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel          # preview
vercel --prod
```

No environment variables are needed. `vercel.json` rewrites `/api/*` to the Express app in `api/index.js` and sets strict security headers on the frontend itself (so the tool scores well on itself). Never set `ALLOW_PRIVATE_TARGETS` in production.

## Layout

```
api/index.js              Vercel entry, exports the Express app
server/app.js             routes + per-IP rate limit
server/dev.js             local listener
server/lib/ssrf.js        URL validation, IP blocklist, pinned DNS lookup, redirect re-validation
server/lib/analyze.js     orchestration, transport checks
server/lib/checks/*.js    headers, cookies, CORS
server/lib/fixes.js       fix snippets per stack
server/lib/score.js       penalties and grades
src/                      React UI
test/                     node:test suites
```

## Security notes

This service fetches URLs on behalf of visitors, so it is an SSRF target. Protections:

- Only `http`/`https`, ports 80/443/8080/8443, no URL credentials, no `localhost`, `.local`, `.internal` or single-label hosts.
- DNS is resolved once per connection and every address is checked against private, loopback, link-local (cloud metadata), CGNAT, multicast and reserved ranges, including IPv4-mapped, NAT64 and 6to4 IPv6 forms. The socket connects to the validated address, so DNS rebinding can't swap it afterwards.
- Redirects are followed manually (max 5) and each hop is re-validated.
- 8 second timeout, response bodies are never read, request body limit 10 KB.
- Best-effort in-memory rate limit (20 scans/min/IP). Serverless instances don't share memory, so add Vercel Firewall rate limiting or Upstash for a public deployment.

## Scoring

Start at 100. Critical -30, high -15, medium -8, low -3, info/pass 0. Any critical finding caps the score at 40. A+ 97+, A 90+, B 80+, C 65+, D 50+, F below.
