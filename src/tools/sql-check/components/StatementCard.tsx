import { CircleCheck, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import CodeBlock from "@/components/CodeBlock";
import { SEVERITIES, gradeTone } from "@/lib/severity";
import { cn } from "@/lib/utils";
import type { Category, SqlFinding, StatementResult } from "../types";
import SqlFindingRow from "./SqlFindingRow";

const RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i]));

interface Props {
  s: StatementResult;
  category: Category | "all";
  showPassed: boolean;
}

export default function StatementCard({ s, category, showPassed }: Props) {
  const issues = s.findings.filter((f) => f.severity !== "pass");
  const visible: SqlFinding[] = s.findings
    .filter((f) => (category === "all" || f.category === category) && (showPassed || f.severity !== "pass"))
    .sort((a, b) => RANK[a.severity] - RANK[b.severity]);

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-3">
        <Badge variant="secondary" className="font-mono uppercase">{s.kind === "unknown" ? "?" : s.kind}</Badge>
        <span className="text-sm text-muted-foreground">Statement {s.index + 1} · line {s.line}</span>
        {s.analyzed ? (
          <span className="ml-auto flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">{s.score.level}</span>
            <span className={cn("grid size-9 place-items-center rounded-full bg-current/10 text-base font-extrabold ring-2 ring-current/30", gradeTone(s.score.grade))} aria-label={`Grade ${s.score.grade}`}>
              {s.score.grade}
            </span>
          </span>
        ) : (
          <span className="ml-auto text-sm text-muted-foreground">Nothing to optimize</span>
        )}
      </div>

      <div className="px-4 pt-4">
        <CodeBlock code={s.sql} />
      </div>

      {s.parseError && (
        <p className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-sev-high/10 px-3 py-2 text-sev-high">
          <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {s.parseError.message}
            {s.parseError.line ? ` (line ${s.parseError.line}, column ${s.parseError.column})` : ""}
          </span>
        </p>
      )}

      {s.analyzed && issues.length === 0 && (
        <p className="mx-4 mt-3 flex items-center gap-2 text-sev-pass">
          <CircleCheck className="size-4" aria-hidden="true" /> No problems found.
        </p>
      )}

      {visible.length > 0 ? (
        <ul className="m-0 mt-4 list-none border-t p-0">
          {visible.map((f, i) => (
            <SqlFindingRow key={`${f.id}-${i}`} f={f} defaultOpen={f.severity === "critical"} />
          ))}
        </ul>
      ) : (
        <div className="h-4" />
      )}
    </Card>
  );
}
