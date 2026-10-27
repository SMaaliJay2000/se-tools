import { useMemo, useState } from "react";
import { ArrowRight, ChevronRight, Download, LayoutGrid, Radar, ServerCog, type LucideIcon } from "lucide-react";
import type { Category, ScanResult, Severity } from "../types";
import { CATEGORY_LABEL, SEVERITIES } from "../types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { CAT_ICON } from "@/lib/severity";
import Grade from "./Grade";
import FindingRow from "./Finding";

const ORDER = Object.fromEntries(SEVERITIES.map((s, i) => [s, i])) as Record<Severity, number>;

function download(r: ScanResult) {
  const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `header-check-${new URL(r.finalUrl).hostname}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

const None = () => <span className="text-muted-foreground">none</span>;

function Panel({ icon: Icon, title, count, children }: { icon: LucideIcon; title: string; count: number; children: React.ReactNode }) {
  return (
    <Collapsible asChild>
      <Card className="mt-4 gap-0 py-0">
        <CollapsibleTrigger className="group flex items-center gap-2 px-4 py-3.5 text-left font-semibold">
          <Icon className="size-4 text-primary" aria-hidden="true" />
          {title} <span className="font-normal text-muted-foreground">({count})</span>
          <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" />
        </CollapsibleTrigger>
        <CollapsibleContent className="px-4 pb-4">{children}</CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function Report({ r }: { r: ScanResult }) {
  const [cat, setCat] = useState<Category | "all">("all");
  const [issuesOnly, setIssuesOnly] = useState(false);

  const cats = useMemo(() => {
    const set = new Set(r.findings.map((f) => f.category));
    return (Object.keys(CATEGORY_LABEL) as Category[]).filter((c) => set.has(c));
  }, [r]);

  const list = useMemo(
    () =>
      r.findings
        .filter((f) => (cat === "all" || f.category === cat) && (!issuesOnly || f.severity !== "pass"))
        .sort((a, b) => ORDER[a.severity] - ORDER[b.severity]),
    [r, cat, issuesOnly]
  );

  const host = new URL(r.finalUrl).host;
  const filters: { key: Category | "all"; label: string; icon: LucideIcon }[] = [
    { key: "all", label: "All", icon: LayoutGrid },
    ...cats.map((c) => ({ key: c, label: CATEGORY_LABEL[c], icon: CAT_ICON[c] })),
  ];

  return (
    <section className="mt-7 animate-rise" aria-live="polite">
      <Card className="flex-row flex-wrap items-center gap-8 p-6">
        <Grade score={r.score} />
        <div className="grid min-w-0 flex-[1_1_260px] justify-items-start gap-2.5">
          <h2 className="text-xl font-semibold tracking-tight [overflow-wrap:anywhere]">{host}</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Response</dt>
            <dd>{r.status} {r.statusText}</dd>
            <dt className="text-muted-foreground">Scanned</dt>
            <dd>{new Date(r.scannedAt).toLocaleString()} in {(r.durationMs / 1000).toFixed(1)}s</dd>
            {r.tls?.protocol && (<><dt className="text-muted-foreground">TLS</dt><dd className="[overflow-wrap:anywhere]">{r.tls.protocol}{r.tls.issuer ? `, issued by ${r.tls.issuer}` : ""}{r.tls.daysLeft !== null ? `, ${r.tls.daysLeft} days left` : ""}</dd></>)}
          </dl>
          <Button variant="outline" size="sm" onClick={() => download(r)}><Download aria-hidden="true" /> Download JSON</Button>
        </div>
      </Card>

      {r.chain.length > 1 && (
        <Card className="mt-4 px-4 py-3">
          <ol className="grid gap-1.5 font-mono text-xs text-muted-foreground [overflow-wrap:anywhere]" aria-label="Redirect chain">
            {r.chain.map((c, i) => (
              <li key={i} className="flex items-center gap-1.5">
                {i > 0 && <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />}
                <Badge variant="secondary" className="font-mono">{c.status}</Badge> {c.url}
              </li>
            ))}
          </ol>
        </Card>
      )}

      <div className="mt-7 mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
          {filters.map(({ key, label, icon: Icon }) => (
            <Button key={key} size="sm" variant={cat === key ? "default" : "outline"} className="rounded-full" aria-pressed={cat === key} onClick={() => setCat(key)}>
              <Icon aria-hidden="true" /> {label}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          <Switch id="issues-only" checked={issuesOnly} onCheckedChange={setIssuesOnly} />
          <Label htmlFor="issues-only" className="font-normal text-muted-foreground">Hide passed checks</Label>
        </div>
      </div>

      {list.length === 0 ? (
        <p className="py-4 text-muted-foreground">Nothing to show with these filters.</p>
      ) : (
        <Card className="gap-0 py-0">
          <ul>
            {list.map((f) => (
              <FindingRow key={f.id} f={f} defaultOpen={f.severity === "critical" || f.severity === "high"} />
            ))}
          </ul>
        </Card>
      )}

      <Panel icon={Radar} title="CORS probes" count={r.cors.probes.length}>
        <p className="mb-2 text-sm text-muted-foreground">Each row is a request sent with that Origin. A safe server answers foreign origins without Access-Control-Allow-Origin.</p>
        <Table>
          <TableHeader>
            <TableRow><TableHead>Probe</TableHead><TableHead>Origin sent</TableHead><TableHead>Status</TableHead><TableHead>Allow-Origin</TableHead><TableHead>Credentials</TableHead><TableHead>Vary</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {r.cors.probes.map((p) => (
              <TableRow key={p.key}>
                <TableCell>{p.label}</TableCell>
                <TableCell><code className="text-xs">{p.origin}</code></TableCell>
                <TableCell>{p.error ?? p.status}</TableCell>
                <TableCell>{p.acao ? <code className={cn("text-xs", (p.acao === p.origin || p.acao === "*") && "text-sev-critical")}>{p.acao}</code> : <None />}</TableCell>
                <TableCell>{p.acac ?? <None />}</TableCell>
                <TableCell>{p.vary ?? <None />}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>

      <Panel icon={ServerCog} title="Response headers" count={r.headers.length}>
        <Table>
          <TableBody>
            {r.headers.map(([k, v], i) => (
              <TableRow key={i}>
                <TableHead scope="row" className="h-auto py-2 align-top font-mono text-xs font-normal">{k}</TableHead>
                <TableCell className="font-mono text-xs break-all whitespace-pre-wrap">{v}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Panel>
    </section>
  );
}
