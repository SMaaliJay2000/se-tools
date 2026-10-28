# SE Tools

Utilities for software engineers, in one React + Vite + TypeScript app with an Express API. Deploys to Vercel as-is. Each tool is a self-contained folder on both sides of the wire, so adding another one is a local change.

| Tool | Route | What it does |
| --- | --- | --- |
| **Header Check** | `/header-check` | Scans a URL for missing security headers, risky cookies and CORS misconfigurations, with fixes for Express, ASP.NET Core, nginx and IIS |
| **Hash Playground** | `/hash-playground` | SHA-2, HMAC, bcrypt, Argon2id, PBKDF2 and AES-GCM with live parameters, hash verification, salt/IV visualisation, cost-factor benchmarks, a tuning guide, and equivalent code for C#, Node.js, Python, Java, Go and PHP |
| **SQL Check** | `/sql-check` | Static review of SQL for PostgreSQL, MySQL, SQL Server and SQLite: syntax errors, missing WHERE, cross joins, non-sargable filters, full scans and more, graded per statement, with optional schema-aware index advice |

## Run locally

```bash
npm install
npm run dev        # API on :3001, Vite on :3000 (proxies /api)
npm test           # all server-side suites
npm run build      # type-check + production build
```

To scan servers on your own machine (for example `http://localhost:5000`) with Header Check, start the API with the SSRF guard relaxed. **Development only:**

```bash
ALLOW_PRIVATE_TARGETS=true npm run dev
```

## Deploy to Vercel

```bash
npm i -g vercel
vercel          # preview
vercel --prod
```

No environment variables are needed. `vercel.json` rewrites `/api/*` to the Express app in `api/index.js`, serves `index.html` for every other path (client-side routes), and sets strict security headers on the frontend itself (so Header Check scores well on itself). Never set `ALLOW_PRIVATE_TARGETS` in production.

## Layout

```
api/index.js                    Vercel entry, exports the Express app
server/
  app.js                        mounts every tool at /api/<id>, JSON error handler
  dev.js                        local listener
  shared/rate-limit.js          per-IP limiter and concurrency cap, reused by tools
  shared/score.js               severity penalties, 0-100 score and A+..F grade, reused by tools that report findings
  tools/
    index.js                    server-side tool registry
    header-check/               routes.js + lib/ (ssrf, analyze, checks/, fixes, score)
    hash-playground/            routes.js + lib/ (passwords/, digest, aes-gcm, benchmark, tuning, validation)
    sql-check/                  routes.js + lib/ (split, parse, ast, schema, score, analyze, rules/)
src/
  main.tsx, App.tsx             shell: header, tool navigation, home, routing
  lib/router.tsx                tiny History API router
  components/                   shared UI: shadcn primitives in ui/, CodeBlock, CopyButton, PageIntro, Grade, Segmented
  hooks/useAction.ts            loading/error/data wrapper for API calls
  lib/severity.tsx              severity/grade styling and the Score type shared by tools that report findings
  tools/
    registry.ts                 client-side tool registry (lazy-loaded pages)
    header-check/               HeaderCheckTool.tsx, api.ts, types.ts, history.ts, components/, lib/
    hash-playground/            HashPlaygroundTool.tsx, api.ts, types.ts, panels/, components/, snippets/, lib/
    sql-check/                  SqlCheckTool.tsx, api.ts, types.ts, components/, lib/
test/<tool-id>/                 node:test suites per tool
```

### Adding a tool

1. `server/tools/<id>/routes.js` exports an Express `Router` (install its own `express.json` limit and rate limits); register it in `server/tools/index.js`. It is served at `/api/<id>/...`.
2. `src/tools/<id>/` holds a default-exported page component; add an entry (id, name, tagline, icon, lazy import) to `src/tools/registry.ts`. It is served at `/<id>/<sub-path>` and appears in the header and on the home page.
3. Tests go in `test/<id>/*.test.js`.

## Header Check

### What it checks

| Area | Checks |
| --- | --- |
| HTTPS | Plain HTTP, HTTPS to HTTP redirect downgrade, invalid/expired/expiring certificate, TLS 1.0/1.1 |
| Headers | CSP (missing, report-only, `unsafe-inline`, `unsafe-eval`, wildcards, `object-src`, `base-uri`), HSTS, X-Frame-Options / `frame-ancestors`, `nosniff`, Referrer-Policy, Permissions-Policy, COOP/CORP/COEP, legacy X-XSS-Protection |
| Cookies | `Secure`, `HttpOnly`, `SameSite`, `SameSite=None`, `__Host-` prefix rules. Session-like names are rated higher |
| CORS | Reflected arbitrary origin, reflection with credentials, `*` (with and without credentials), `null` origin, prefix/suffix origin bypass, missing `Vary: Origin`, private network access, permissive preflight headers |
| Disclosure | `Server` version, `X-Powered-By`, `X-AspNet-Version` |

Every finding has a copy-paste fix for **Express, ASP.NET Core, nginx and IIS**. Enter your frontend origin to see whether the target allows it, and which methods, headers and max-age it returns.

Extras: A+ to F grade, redirect chain, raw response headers, CORS probe table, JSON export, scan history (browser localStorage only), and a staging vs production **Compare** view.

API: `POST /api/header-check/analyze` with `{ "url": "...", "origin": "..." }`.

### Security notes

This service fetches URLs on behalf of visitors, so it is an SSRF target. Protections:

- Only `http`/`https`, ports 80/443/8080/8443, no URL credentials, no `localhost`, `.local`, `.internal` or single-label hosts.
- DNS is resolved once per connection and every address is checked against private, loopback, link-local (cloud metadata), CGNAT, multicast and reserved ranges, including IPv4-mapped, NAT64 and 6to4 IPv6 forms. The socket connects to the validated address, so DNS rebinding can't swap it afterwards.
- Redirects are followed manually (max 5) and each hop is re-validated.
- 8 second timeout, response bodies are never read, request body limit 10 KB.
- Best-effort in-memory rate limit (20 scans/min/IP). Serverless instances don't share memory, so add Vercel Firewall rate limiting or Upstash for a public deployment.

### Scoring

Start at 100. Critical -30, high -15, medium -8, low -3, info/pass 0. Any critical finding caps the score at 40. A+ 97+, A 90+, B 80+, C 65+, D 50+, F below.

## Hash Playground

Tabs: SHA-2, HMAC, Password hashing, Verify hash, AES-GCM, Benchmark, Tuning guide. The UI builds its forms from `GET /api/hash-playground/algorithms`, so parameter names, bounds and defaults live only on the server.

| Endpoint (all under `/api/hash-playground`) | Purpose |
| --- | --- |
| `GET /algorithms` | Catalog: algorithms, parameters, bounds, defaults |
| `POST /digest`, `POST /hmac` | SHA-256/384/512 and HMAC over text, hex or base64 input |
| `POST /password/hash` | `{algorithm, password, parameters?}` returns the encoded hash, salt and hash bytes, timing, warnings |
| `POST /password/verify` | `{password, encoded}`; the algorithm is detected from the prefix |
| `POST /aes-gcm/encrypt`, `/decrypt` | Base64 key/IV/ciphertext/tag, optional AAD; `auth_failed` on any modification |
| `POST /benchmark` | Sweep one parameter and time each value |
| `POST /tuning/recommend` | `{targetMs, argon2MemoryKb}` returns parameters calibrated to this machine |

Errors are `{ "error": "message", "code": "stable_code" }` with status 400 for user-correctable problems.

Encoded formats are self-describing and interoperable, which the test suite checks against hashes made by Node (bcryptjs) and Python (argon2-cffi):

- bcrypt: `$2a$12$<22-char salt><31-char hash>` (verifies `$2a$`/`$2b$`/`$2y$` from any stack)
- Argon2id: `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>` (standard PHC string)
- PBKDF2: `$pbkdf2-sha256$i=600000$<salt>$<hash>` (PHC-style; PBKDF2 has no universal format)

Implementation: Node `crypto` for SHA-2, HMAC, PBKDF2 and AES-GCM; [`hash-wasm`](https://github.com/Daninet/hash-wasm) (WebAssembly, no native build) for bcrypt and Argon2id, so it deploys on Vercel unchanged.

### Safety properties

- **Bounded work.** Every parameter has a maximum (bcrypt cost ≤ 14, Argon2id ≤ 128 MiB / 10 passes / 16 lanes, PBKDF2 ≤ 5 M rounds). The same limits apply to values *parsed out of a pasted hash*, so a crafted string can't demand unbounded CPU or memory.
- **Throttling.** 120 requests/min per IP, 40/min for hashing endpoints, at most 2 hashing requests in flight per instance. Bodies are capped at 1 MB and benchmarks stop after 15 s (Vercel allows 30 s).
- **Constant-time comparison** for hash and MAC checks; AES-GCM never releases plaintext on tag failure.
- Inputs are sent to the server in plain text and never logged or stored. The UI warns not to enter real secrets.

Timings are wall-clock on whatever machine runs the API; run the calibration on production-class hardware before copying numbers. Tuning guidance follows the OWASP Password Storage Cheat Sheet; re-check it against the current revision before adopting values.

### Extending

- **New password algorithm:** add a file to `server/tools/hash-playground/lib/passwords/` exporting `{ id, displayName, description, formatExample, parameters, costParameter, canVerify, hash, verify }` and list it in that folder's `index.js`. The catalog, forms, verify auto-detection and benchmark pick it up; add a snippet template for the code samples.
- **New language in the code samples:** add it to `STACKS` and the builders in `src/tools/hash-playground/snippets/templates.ts`.

## SQL Check

Paste one or more statements, pick a dialect, and get a grade per statement and overall. It is a **static review**: nothing connects to a database and no execution plan is read, so the grade is a checklist, not a benchmark. Syntax problems are results (a finding with line and column), not request errors, and the other statements in the script are still analysed.

Statements are parsed with [`node-sql-parser`](https://github.com/taozhi8833998/node-sql-parser) (per-dialect grammars for PostgreSQL, MySQL/MariaDB, SQL Server and SQLite) and checked by a table of rules. If the SQL is valid for your database but the parser doesn't support the syntax (for example PostgreSQL's `DELETE ... USING`), you get a syntax finding; a keyword fallback still catches `UPDATE`/`DELETE` without `WHERE` and `SELECT *` in that case.

| Category | Rules |
| --- | --- |
| Safety | `UPDATE`/`DELETE` without `WHERE` (critical), always-true `WHERE` such as `1=1` (critical), `DROP`/`TRUNCATE` |
| Correctness | syntax error (with a hint when the SQL parses under another dialect), join without a condition / Cartesian product, comma joins, `= NULL`, `NOT IN (subquery)`, `INSERT` without a column list or with a column/value count mismatch, non-grouped columns, `HAVING` without an aggregate, `LIMIT`/`TOP` without `ORDER BY`, duplicate aliases, `UNION` vs `UNION ALL`, unqualified columns in multi-table queries |
| Performance | `SELECT *`, no `WHERE`/limit, function or arithmetic on a column (non-sargable), leading-wildcard `LIKE`, `OR` across columns, very long `IN` lists, deep `OFFSET`, `ORDER BY RAND()/RANDOM()/NEWID()`, correlated subqueries in the select list, many joins, `DISTINCT` over joins |
| Schema (optional) | unknown tables and columns (with "did you mean"), filters/joins/sorts with no usable index, composite index used without its leading column, `SELECT *` on wide tables |

Paste `CREATE TABLE`, `CREATE INDEX` and `ALTER TABLE ... ADD INDEX` statements into the optional schema box to enable the schema rules. Every finding that isn't a pass carries a "how to fix", with dialect-specific advice where it differs (`TOP` vs `LIMIT`, `NEWID()`, expression indexes).

Scoring uses the shared penalties (critical -30, high -15, medium -8, low -3; any critical caps the score at 40). The overall score is the rounded mean of the statement scores, still capped by any critical; a statement that doesn't parse is capped at 50.

| Endpoint (under `/api/sql-check`) | Purpose |
| --- | --- |
| `GET /options` | Dialects and limits (100,000 characters of SQL, 100,000 of schema, 50 statements, 20,000 characters per statement) |
| `POST /analyze` | `{ sql, dialect, schema? }` returns `{ statements[], findings[], score, schema }`; 400 with a `code` only for bad requests (empty, too long, unknown dialect) |

Queries are processed in memory and never stored or logged; the UI warns not to paste real data or credentials. Limits: 60 requests/min per IP and at most 4 analyses in flight per instance.

### Extending

- **New rule:** add `{ id, category, severity, title, applies?, needsSchema?, pass?, run(ctx) }` to a file in `server/tools/sql-check/lib/rules/` (`run` returns hits `{ detail, fix, snippet?, severity? }`), plus a bad/good SQL pair in `test/sql-check/rules.test.js`. Thresholds live in `rules/thresholds.js`.
- **AST shapes differ by dialect** (column names, `LIMIT`/`TOP`/`FETCH`, `UNION` via `_next`), so rules read them through the helpers in `lib/ast.js`.
