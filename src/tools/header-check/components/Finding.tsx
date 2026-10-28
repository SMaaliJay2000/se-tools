import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { Finding, Fix } from "../types";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CodeBlock from "@/components/CodeBlock";
import { cn } from "@/lib/utils";
import { SEV_RAIL, SeverityBadge } from "@/lib/severity";

const STACKS: { key: keyof Fix; label: string }[] = [
  { key: "express", label: "Express" },
  { key: "aspnet", label: "ASP.NET Core" },
  { key: "nginx", label: "nginx" },
  { key: "iis", label: "IIS" },
];

function FixTabs({ fix }: { fix: Fix }) {
  const [stack, setStack] = useState<keyof Fix>(() => {
    try {
      const saved = localStorage.getItem("headercheck.stack") as keyof Fix | null;
      return saved && saved in fix ? saved : "express";
    } catch {
      return "express";
    }
  });
  const pick = (k: string) => {
    setStack(k as keyof Fix);
    try {
      localStorage.setItem("headercheck.stack", k);
    } catch {
      /* ignore */
    }
  };
  return (
    <Tabs value={stack} onValueChange={pick} className="min-w-0 gap-2">
      <TabsList aria-label="Fix for stack" className="flex-wrap">
        {STACKS.map((s) => <TabsTrigger key={s.key} value={s.key} className="px-3">{s.label}</TabsTrigger>)}
      </TabsList>
      {STACKS.map((s) => (
        <TabsContent key={s.key} value={s.key}><CodeBlock code={fix[s.key]} /></TabsContent>
      ))}
    </Tabs>
  );
}

export default function FindingRow({ f, defaultOpen }: { f: Finding; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const expandable = !!(f.detail || f.value || f.fix);
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <li className={cn("border-b border-l-4 last:border-b-0", SEV_RAIL[f.severity])}>
        <CollapsibleTrigger
          disabled={!expandable}
          className="group grid w-full grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 disabled:cursor-default sm:grid-cols-[7rem_1fr_auto]"
        >
          <SeverityBadge s={f.severity} />
          <span className={cn("col-start-1 sm:col-start-2 sm:row-start-1", f.severity === "pass" ? "text-muted-foreground" : "font-medium")}>{f.title}</span>
          <ChevronDown
            className="col-start-2 row-span-2 row-start-1 size-[18px] text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180 group-disabled:invisible sm:col-start-3 sm:row-span-1"
            aria-hidden="true"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="grid max-w-[86ch] min-w-0 animate-rise gap-3 px-4 pb-5 sm:pl-[calc(7rem+28px)]">
          <p className="text-muted-foreground">{f.detail}</p>
          {(f.value || f.header) && (
            <div className="grid min-w-0 gap-1">
              {f.header && <span className="text-xs font-semibold text-muted-foreground lowercase">{f.header}</span>}
              <code className={cn("block rounded-lg bg-muted px-3 py-2 text-[0.82rem] [overflow-wrap:anywhere] whitespace-pre-wrap", !f.value && "text-muted-foreground italic")}>
                {f.value ?? "not set"}
              </code>
            </div>
          )}
          {f.fix && <FixTabs fix={f.fix} />}
        </CollapsibleContent>
      </li>
    </Collapsible>
  );
}
