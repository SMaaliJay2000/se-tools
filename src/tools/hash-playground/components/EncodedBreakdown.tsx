import { cn } from "@/lib/utils";

type Role = "sep" | "meta" | "params" | "salt" | "hash";

// Full class strings so Tailwind can see them at build time.
const ROLE_CLASS: Record<Role, string> = {
  sep: "text-muted-foreground",
  meta: "text-muted-foreground",
  params: "font-semibold text-sev-high",
  salt: "font-semibold text-sev-low",
  hash: "text-sev-pass",
};

/**
 * Splits an encoded hash into labelled pieces. bcrypt packs salt+hash into one 53-char token ($2a$12$<22 salt><31 hash>);
 * the PHC-style formats (argon2id, pbkdf2) put the salt and hash in the last two $-separated fields.
 */
export function parseEncoded(encoded: string): { text: string; role: Role }[] {
  if (/^\$2[aby]\$/.test(encoded)) {
    const [, version, cost, rest = ""] = encoded.split("$");
    return [
      { text: `$${version}$`, role: "meta" },
      { text: cost, role: "params" },
      { text: "$", role: "sep" },
      { text: rest.slice(0, 22), role: "salt" },
      { text: rest.slice(22), role: "hash" },
    ];
  }
  const fields = encoded.split("$").slice(1);
  const parts: { text: string; role: Role }[] = [];
  fields.forEach((text, i) => {
    const role: Role = i === fields.length - 1 ? "hash" : i === fields.length - 2 ? "salt" : text.includes("=") && !text.startsWith("v=") ? "params" : "meta";
    parts.push({ text: "$", role: "sep" }, { text, role });
  });
  return parts;
}

const LEGEND: { role: Exclude<Role, "sep">; label: string }[] = [
  { role: "meta", label: "Algorithm / version" },
  { role: "params", label: "Cost parameters" },
  { role: "salt", label: "Salt" },
  { role: "hash", label: "Hash" },
];

export default function EncodedBreakdown({ encoded }: { encoded: string }) {
  return (
    <div className="grid gap-2">
      <code className="block rounded-lg bg-muted px-3 py-2.5 font-mono text-[0.85rem] [overflow-wrap:anywhere]" aria-label={encoded}>
        {parseEncoded(encoded).map((p, i) => (
          <span key={i} className={ROLE_CLASS[p.role]}>{p.text}</span>
        ))}
      </code>
      <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs text-muted-foreground">
        {LEGEND.map((l) => (
          <li key={l.role} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm bg-current", ROLE_CLASS[l.role])} aria-hidden="true" /> {l.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
