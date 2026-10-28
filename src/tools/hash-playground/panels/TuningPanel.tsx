import { useMemo, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api } from "../api";
import Field from "../components/Field";
import { ErrorNotice } from "../components/Notices";
import SnippetViewer from "../components/SnippetViewer";
import { useAction } from "../hooks/useAction";
import { formatMemory, formatMs, formatParam } from "../lib/format";
import { passwordSpec } from "../snippets/templates";
import { ARGON2_PROFILES, ARGON2_RULES, BCRYPT_RULES, GENERAL_RULES, PBKDF2_MINIMUMS } from "./tuning-guide";

const MEMORY_CHOICES = [19_456, 46_080, 65_536, 131_072];
const LABELS: Record<string, string> = { bcrypt: "bcrypt", pbkdf2: "PBKDF2-HMAC-SHA256", argon2id: "Argon2id" };

function Rules({ items }: { items: string[] }) {
  return (
    <ul className="m-0 grid list-disc gap-1.5 pl-5">
      {items.map((r) => <li key={r}>{r}</li>)}
    </ul>
  );
}

export default function TuningPanel() {
  const [targetMs, setTargetMs] = useState(250);
  const [memoryKb, setMemoryKb] = useState(65_536);
  const [shown, setShown] = useState("argon2id");
  const { data, error, loading, run } = useAction(api.recommend);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run({ targetMs, argon2MemoryKb: memoryKb });
  };

  const spec = useMemo(() => {
    const rec = data?.find((r) => r.algorithm === shown);
    return rec ? passwordSpec(rec.algorithm, rec.parameters) : null;
  }, [data, shown]);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Calibrate on this server</CardTitle>
          <CardDescription>
            Finds the strongest parameters that still hash within your time budget <strong>on the machine running the API</strong>. Run it on production-class hardware for numbers you can use.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Target time per hash: ${targetMs} ms`}>
                <input type="range" min={50} max={1000} step={10} value={targetMs} onChange={(e) => setTargetMs(Number(e.target.value))} className="w-full accent-primary" />
              </Field>
              <Field label="Argon2id memory budget" hint="Memory is fixed first; iterations are tuned to the target.">
                <NativeSelect className="w-full sm:max-w-48" value={memoryKb} onChange={(e) => setMemoryKb(Number(e.target.value))}>
                  {MEMORY_CHOICES.map((m) => (
                    <NativeSelectOption key={m} value={m}>{formatMemory(m)}</NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>
            <Button type="submit" className="justify-self-start" disabled={loading}>{loading ? "Calibrating (a few seconds)…" : "Find parameters"}</Button>
            <ErrorNotice message={error} />
          </form>
          {data && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Algorithm</TableHead>
                  <TableHead>Recommended</TableHead>
                  <TableHead>Measured</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r) => (
                  <TableRow key={r.algorithm} className={cn(r.algorithm === shown && "bg-sev-pass/10")}>
                    <TableCell>
                      <Button type="button" variant="link" className="h-auto p-0" onClick={() => setShown(r.algorithm)}>{LABELS[r.algorithm] ?? r.algorithm}</Button>
                    </TableCell>
                    <TableCell>{Object.entries(r.parameters).map(([k, v]) => `${k}=${formatParam(k, v)}`).join(", ")}</TableCell>
                    <TableCell>{formatMs(r.measuredMs)}</TableCell>
                    <TableCell className="whitespace-normal text-muted-foreground">{r.note}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {spec && <SnippetViewer spec={spec} />}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>bcrypt cost factor</CardTitle></CardHeader>
          <CardContent><Rules items={BCRYPT_RULES} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>PBKDF2 minimum iterations</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            <Table>
              <TableBody>
                {PBKDF2_MINIMUMS.map((m) => (
                  <TableRow key={m.prf}>
                    <TableCell>{m.prf}</TableCell>
                    <TableCell>{m.iterations}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">Linear cost and no memory hardness: use only when FIPS-140 compliance requires it.</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Argon2id parameters</CardTitle></CardHeader>
        <CardContent className="grid gap-4">
          <Rules items={ARGON2_RULES} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Memory (m)</TableHead>
                <TableHead>Passes (t)</TableHead>
                <TableHead>Lanes (p)</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ARGON2_PROFILES.map((p) => (
                <TableRow key={p.memoryKb}>
                  <TableCell>{p.memory}</TableCell>
                  <TableCell>{p.t}</TableCell>
                  <TableCell>{p.p}</TableCell>
                  <TableCell className="whitespace-normal text-muted-foreground">{p.note}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground">These profiles are roughly equivalent in strength: pick the one your RAM budget allows.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Rules that apply to all of them</CardTitle></CardHeader>
        <CardContent><Rules items={GENERAL_RULES} /></CardContent>
      </Card>
    </div>
  );
}
