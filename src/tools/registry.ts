import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { Fingerprint, ShieldCheck, type LucideIcon } from "lucide-react";

/** Props every tool page receives. `subPath` is what follows /<id>/ in the URL, e.g. ["password"] for /hash-playground/password. */
export interface ToolProps {
  subPath: string[];
}

export interface Tool {
  /** URL segment and API prefix (/api/<id>); matches the folder under server/tools/ and src/tools/. */
  id: string;
  name: string;
  tagline: string;
  icon: LucideIcon;
  component: LazyExoticComponent<ComponentType<ToolProps>>;
}

// Adding a tool: create src/tools/<id>/ with a default-exported page, add it here, and (if it needs an API)
// register its router in server/tools/index.js. Lazy imports keep each tool out of the others' bundles.
export const tools: Tool[] = [
  {
    id: "header-check",
    name: "Header Check",
    tagline: "Scan any URL for missing security headers, risky cookies and CORS misconfigurations, with fixes for Express, ASP.NET Core, nginx and IIS.",
    icon: ShieldCheck,
    component: lazy(() => import("./header-check/HeaderCheckTool")),
  },
  {
    id: "hash-playground",
    name: "Hash Playground",
    tagline: "Experiment with SHA-2, HMAC, bcrypt, Argon2id, PBKDF2 and AES-GCM, benchmark cost factors, and copy equivalent code for six stacks.",
    icon: Fingerprint,
    component: lazy(() => import("./hash-playground/HashPlaygroundTool")),
  },
];
