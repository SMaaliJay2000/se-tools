import { Wrench, type LucideIcon } from "lucide-react";
import type { Category } from "../types";
import { CATEGORY_LABEL } from "../types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CAT_ICON } from "../lib/severity";

const CHECKS: Record<Category, string[]> = {
  transport: ["Plain HTTP and HTTPS → HTTP redirects", "Invalid, expired or expiring certificates", "TLS 1.0 / 1.1"],
  headers: ["CSP: unsafe-inline, unsafe-eval, wildcards", "HSTS, X-Frame-Options, nosniff", "Referrer, Permissions, COOP / CORP / COEP"],
  cookies: ["Secure, HttpOnly, SameSite", "SameSite=None without Secure", "__Host- prefix rules"],
  cors: ["Reflected or null origin, with credentials", "Prefix / suffix origin bypass", "Missing Vary: Origin, private network access"],
  disclosure: ["Server version strings", "X-Powered-By", "X-AspNet-Version"],
};

const CARDS: { key: string; title: string; icon: LucideIcon; items: string[]; accent?: boolean }[] = [
  ...(Object.keys(CHECKS) as Category[]).map((c) => ({ key: c, title: CATEGORY_LABEL[c], icon: CAT_ICON[c], items: CHECKS[c] })),
  { key: "fixes", title: "Copy-paste fixes", icon: Wrench, items: ["Express, ASP.NET Core, nginx and IIS", "A+ to F grade with JSON export", "Staging vs production compare"], accent: true },
];

/** Empty-state overview of what a scan covers. */
export default function Features() {
  return (
    <section className="mt-6 grid animate-rise grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4" aria-label="What gets checked">
      {CARDS.map(({ key, title, icon: Icon, items, accent }) => (
        <Card key={key} className={cn("transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:ring-primary/40", accent && "bg-gradient-to-br from-primary/10 to-card")}>
          <CardHeader className="gap-3">
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-primary">
              <Icon className="size-[18px]" aria-hidden="true" />
            </span>
            <CardTitle className="font-semibold">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid list-disc gap-1 pl-4 text-muted-foreground marker:text-primary">
              {items.map((t) => <li key={t}>{t}</li>)}
            </ul>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
