import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

/** Badge + headline + lede at the top of a tool page. */
export default function PageIntro({ badge, icon: Icon, title, children }: { badge: string; icon: LucideIcon; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 grid gap-3">
      <Badge variant="secondary" className="bg-primary/10 text-primary">
        <Icon aria-hidden="true" /> {badge}
      </Badge>
      <h1 className="max-w-[24ch] text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      <p className="max-w-[62ch] text-muted-foreground">{children}</p>
    </div>
  );
}
