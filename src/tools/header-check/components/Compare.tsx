import { useState } from "react";
import { CircleAlert, CircleCheck, GitCompareArrows, Link2, LoaderCircle, Monitor, Server, Tag } from "lucide-react";
import { scan } from "../api";
import type { Finding, ScanResult, Severity } from "../types";
import { SEVERITIES } from "../types";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeverityBadge } from "@/lib/severity";
import Grade from "@/components/Grade";
import IconField from "./IconField";

const RANK = Object.fromEntries(SEVERITIES.map((s, i) => [s, i])) as Record<Severity, number>;

const WATCHED = [
  "content-security-policy", "strict-transport-security", "x-frame-options", "x-content-type-options",
  "referrer-policy", "permissions-policy", "cross-origin-opener-policy", "cross-origin-resource-policy",
  "cross-origin-embedder-policy", "access-control-allow-origin", "access-control-allow-credentials", "server", "x-powered-by",
];

const headerMap = (r: ScanResult) => {
  const m: Record<string, string> = {};
  for (const [k, v] of r.headers) m[k.toLowerCase()] = m[k.toLowerCase()] ? `${m[k.toLowerCase()]}, ${v}` : v;
  return m;
};

interface Side {
  label: string;
  url: string;
  result?: ScanResult;
  error?: string;
}

export default function Compare({ onSaved }: { onSaved: (r: ScanResult) => void }) {
  const [a, setA] = useState<Side>({ label: "Staging", url: "" });
  const [b, setB] = useState<Side>({ label: "Production", url: "" });
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const [ra, rb] = await Promise.allSettled([scan(a.url, origin), scan(b.url, origin)]);
    const apply = (s: Side, r: PromiseSettledResult<ScanResult>): Side =>
      r.status === "fulfilled" ? { ...s, result: r.value, error: undefined } : { ...s, result: undefined, error: (r.reason as Error).message };
    setA(apply(a, ra));
    setB(apply(b, rb));
    if (ra.status === "fulfilled") onSaved(ra.value);
    if (rb.status === "fulfilled") onSaved(rb.value);
    setBusy(false);
  };

  const both = a.result && b.result ? { a: a.result, b: b.result } : null;

  return (
    <div>
      <Card className="p-4">
        <form className="flex flex-wrap items-end gap-4" onSubmit={run}>
          {[
            { side: a, set: setA, id: "a" },
            { side: b, set: setB, id: "b" },
          ].map(({ side, set, id }) => (
            <fieldset key={id} className="grid min-w-0 flex-[1_1_280px] gap-2.5">
              <legend className="mb-1 flex items-center gap-1.5 font-semibold">
                <Server className="size-4 text-primary" aria-hidden="true" /> {side.label || id.toUpperCase()}
              </legend>
              <IconField id={`${id}-label`} label="Environment name" icon={Tag} value={side.label} onChange={(v) => set({ ...side, label: v })} />
              <IconField id={`${id}-url`} label="URL" icon={Link2} placeholder="https://" value={side.url} onChange={(v) => set({ ...side, url: v })} />
              {side.error && (
                <Alert variant="destructive">
                  <CircleAlert aria-hidden="true" />
                  <AlertDescription>{side.error}</AlertDescription>
                </Alert>
              )}
            </fieldset>
          ))}
          <IconField id="cmp-origin" label="Your frontend origin" optional icon={Monitor} placeholder="https://app.example.com" value={origin} onChange={setOrigin} />
          <Button type="submit" size="lg" className="h-10 px-5" disabled={busy || !a.url.trim() || !b.url.trim()}>
            {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <GitCompareArrows aria-hidden="true" />}
            {busy ? "Scanning both…" : "Compare"}
          </Button>
        </form>
      </Card>

      {both && <Diff a={a.label || "A"} b={b.label || "B"} ra={both.a} rb={both.b} />}
    </div>
  );
}

const Same = ({ children }: { children: React.ReactNode }) => (
  <p className="flex items-center gap-2 py-4 text-muted-foreground"><CircleCheck className="size-4 text-sev-pass" aria-hidden="true" /> {children}</p>
);

function Diff({ a, b, ra, rb }: { a: string; b: string; ra: ScanResult; rb: ScanResult }) {
  const fa = new Map(ra.findings.map((f) => [f.id, f]));
  const fb = new Map(rb.findings.map((f) => [f.id, f]));
  const ids = [...new Set([...fa.keys(), ...fb.keys()])];
  const rows = ids
    .map((id) => ({ id, fa: fa.get(id), fb: fb.get(id) }))
    .filter((r) => r.fa?.severity !== r.fb?.severity)
    .sort((x, y) => Math.min(RANK[x.fa?.severity ?? "pass"], RANK[x.fb?.severity ?? "pass"]) - Math.min(RANK[y.fa?.severity ?? "pass"], RANK[y.fb?.severity ?? "pass"]));

  const ma = headerMap(ra), mb = headerMap(rb);
  const hrows = WATCHED.filter((h) => ma[h] !== mb[h]);

  const cell = (f?: Finding) => (f ? <SeverityBadge s={f.severity} /> : <span className="text-muted-foreground">not applicable</span>);
  const val = (v?: string) => (v ? <code className="font-mono text-xs break-all whitespace-pre-wrap">{v}</code> : <span className="text-muted-foreground">not set</span>);

  return (
    <section className="mt-7 animate-rise">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        {[{ n: a, r: ra }, { n: b, r: rb }].map(({ n, r }) => (
          <Card key={n}>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">{n}</CardTitle>
              <p className="text-sm text-muted-foreground">{new URL(r.finalUrl).host}</p>
            </CardHeader>
            <CardContent><Grade score={r.score} /></CardContent>
          </Card>
        ))}
      </div>

      <h3 className="mt-8 mb-3 font-semibold">Findings that differ</h3>
      {rows.length === 0 ? (
        <Same>Both environments produce the same findings.</Same>
      ) : (
        <Card className="px-4 py-1">
          <Table>
            <TableHeader><TableRow><TableHead>Check</TableHead><TableHead>{a}</TableHead><TableHead>{b}</TableHead></TableRow></TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}><TableCell className="whitespace-normal">{(r.fa ?? r.fb)!.title}</TableCell><TableCell>{cell(r.fa)}</TableCell><TableCell>{cell(r.fb)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <h3 className="mt-8 mb-3 font-semibold">Security headers that differ</h3>
      {hrows.length === 0 ? (
        <Same>Watched headers are identical.</Same>
      ) : (
        <Card className="px-4 py-1">
          <Table>
            <TableHeader><TableRow><TableHead>Header</TableHead><TableHead>{a}</TableHead><TableHead>{b}</TableHead></TableRow></TableHeader>
            <TableBody>
              {hrows.map((h) => (
                <TableRow key={h}>
                  <TableHead scope="row" className="h-auto py-2 align-top font-mono text-xs font-normal">{h}</TableHead>
                  <TableCell className="align-top whitespace-normal">{val(ma[h])}</TableCell>
                  <TableCell className="align-top whitespace-normal">{val(mb[h])}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  );
}
