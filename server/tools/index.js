// Server-side tool registry. Each tool owns a folder under server/tools/<id>/ and exposes an Express
// router, mounted at /api/<id>. The matching client entry is src/tools/registry.ts.
import headerCheck from "./header-check/routes.js";
import hashPlayground from "./hash-playground/routes.js";

export const tools = [
  { id: "header-check", router: headerCheck },
  { id: "hash-playground", router: hashPlayground },
];
