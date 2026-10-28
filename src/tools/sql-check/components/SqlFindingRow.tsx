import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SEV_RAIL, SeverityBadge } from "@/lib/severity";
import { cn } from "@/lib/utils";
import { CATEGORY_LABEL, type SqlFinding } from "../types";

export default function SqlFindingRow({ f, defaultOpen }: { f: SqlFinding; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const expandable = !!(f.detail || f.snippet || f.fix);
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <li className={cn("border-b border-l-4 last:border-b-0", SEV_RAIL[f.severity])}>
        <CollapsibleTrigger
          disabled={!expandable}
          className="group grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-default sm:grid-cols-[7rem_1fr_auto_auto]"
        >
          <SeverityBadge s={f.severity} />
          <span className={cn("col-start-1 sm:col-start-2 sm:row-start-1", f.severity === "pass" ? "text-muted-foreground" : "font-medium")}>{f.title}</span>
          <Badge variant="outline" className="hidden text-muted-foreground sm:inline-flex">{CATEGORY_LABEL[f.category]}</Badge>
          <ChevronDown
            className="col-start-2 row-span-2 row-start-1 size-[18px] text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 group-disabled:invisible sm:col-start-4 sm:row-span-1"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="grid max-w-[86ch] min-w-0 animate-rise gap-3 px-4 pb-5 sm:pl-[calc(7rem+28px)]">
          {f.detail && <p className="text-muted-foreground">{f.detail}</p>}
          {f.snippet && (
            <div className="grid min-w-0 gap-1">
              <span className="text-xs font-semibold text-muted-foreground">Where</span>
              <code className="block rounded-lg bg-muted px-3 py-2 font-mono text-[0.82rem] [overflow-wrap:anywhere] whitespace-pre-wrap">{f.snippet}</code>
            </div>
          )}
          {f.fix && (
            <div className="grid min-w-0 gap-1">
              <span className="text-xs font-semibold text-muted-foreground">How to fix</span>
              <p className="rounded-lg border border-sev-pass/30 bg-sev-pass/5 px-3 py-2 whitespace-pre-line [overflow-wrap:anywhere]">{f.fix}</p>
            </div>
          )}
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}
