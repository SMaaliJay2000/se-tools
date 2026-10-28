import { useState } from "react";
import { LoaderCircle, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api } from "../api";
import Field from "../components/Field";
import LineChart from "../components/LineChart";
import { ErrorNotice } from "../components/Notices";
import { useCatalog } from "../CatalogContext";
import { formatMs, formatParam } from "../lib/format";
import type { BenchmarkResponse, PasswordAlgorithm } from "../types";
import { defaultSweep, parseSweep } from "./sweeps";

interface Config {
  parameter: string;
  values: string;
}

const initialConfig = (a: PasswordAlgorithm): Config => {
  const spec = a.parameters.find((p) => p.name === a.costParameter) ?? a.parameters[0];
  return { parameter: spec.name, values: defaultSweep(a.id, spec).join(", ") };
};

export default function BenchmarkPanel() {
  const { passwords, benchmark } = useCatalog();
  const [configs, setConfigs] = useState<Record<string, Config>>(() => Object.fromEntries(passwords.map((a) => [a.id, initialConfig(a)])));
  const [targetMs, setTargetMs] = useState(250);
  const [repeats, setRepeats] = useState(1);
  const [results, setResults] = useState<Record<string, BenchmarkResponse>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [running, setRunning] = useState<string | null>(null);

  const setConfig = (id: string, c: Config) => setConfigs((all) => ({ ...all, [id]: c }));

  // Algorithms run one after another: parallel runs would fight for CPU and distort each other's timings.
  const runAll = async () => {
    setResults({});
    setErrors({});
    for (const a of passwords) {
      const cfg = configs[a.id];
      const spec = a.parameters.find((p) => p.name === cfg.parameter)!;
      const parsed = parseSweep(cfg.values, spec, benchmark.maxPoints);
      if ("error" in parsed) {
        setErrors((e) => ({ ...e, [a.id]: parsed.error }));
        continue;
      }
      setRunning(a.displayName);
      try {
        const res = await api.benchmark({ algorithm: a.id, parameter: cfg.parameter, values: parsed.values, repeats });
        setResults((r) => ({ ...r, [a.id]: res }));
      } catch (e) {
        setErrors((all) => ({ ...all, [a.id]: e instanceof Error ? e.message : String(e) }));
      }
    }
    setRunning(null);
  };

  const times = Object.values(results).flatMap((r) => r.points.map((p) => p.elapsedMs));
  const yMin = Math.min(...times, targetMs);
  const yMax = Math.max(...times, targetMs);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Cost factor vs. hash time, side by side</CardTitle>
          <CardDescription>
            Each algorithm is hashed once per value on <strong>the machine running the API</strong>, so results show your server&rsquo;s reality, not a datasheet. Charts share one log-scale time axis: a straight line means cost
            doubles every step.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Target login time: ${targetMs} ms`} hint="Dashed line on every chart. 100–500 ms is the usual goal.">
              <input type="range" min={50} max={1000} step={10} value={targetMs} onChange={(e) => setTargetMs(Number(e.target.value))} className="w-full accent-primary" />
            </Field>
            <Field label="Runs per point" hint="Median of N; more runs smooth out noise.">
              <NativeSelect className="w-full sm:max-w-32" value={repeats} onChange={(e) => setRepeats(Number(e.target.value))}>
                {Array.from({ length: benchmark.maxRepeats }, (_, i) => i + 1).map((n) => (
                  <NativeSelectOption key={n} value={n}>{n}</NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Button className="justify-self-start" onClick={() => void runAll()} disabled={running !== null}>
            {running ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
            {running ? `Running ${running}…` : "Run benchmark"}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {passwords.map((a) => {
          const cfg = configs[a.id];
          const spec = a.parameters.find((p) => p.name === cfg.parameter)!;
          const res = results[a.id];
          return (
            <Card key={a.id}>
              <CardHeader><CardTitle>{a.displayName}</CardTitle></CardHeader>
              <CardContent className="grid content-start gap-3">
                {a.parameters.length > 1 && (
                  <Field label="Sweep parameter">
                    <NativeSelect
                      className="w-full"
                      value={cfg.parameter}
                      onChange={(e) => {
                        const next = a.parameters.find((p) => p.name === e.target.value)!;
                        setConfig(a.id, { parameter: next.name, values: defaultSweep(a.id, next).join(", ") });
                      }}
                    >
                      {a.parameters.map((p) => (
                        <NativeSelectOption key={p.name} value={p.name}>{p.label}</NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                )}
                <Field label={`${spec.label} values`} hint={`Others stay at defaults. ${spec.min.toLocaleString("en-US")}–${spec.max.toLocaleString("en-US")} ${spec.unit}.`}>
                  <Input value={cfg.values} onChange={(e) => setConfig(a.id, { ...cfg, values: e.target.value })} spellCheck={false} className="font-mono" />
                </Field>
                <ErrorNotice message={errors[a.id]} />
                {res && (
                  <>
                    <LineChart
                      title={`${a.displayName}: hash time by ${spec.label}`}
                      yMin={yMin}
                      yMax={yMax}
                      targetMs={targetMs}
                      points={res.points.map((p) => ({ label: formatParam(res.parameter, p.value), y: p.elapsedMs }))}
                    />
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{spec.label}</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>vs previous</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {res.points.map((p, i) => (
                          <TableRow key={p.value} className={cn(p.elapsedMs <= targetMs && "bg-sev-pass/10")}>
                            <TableCell>{formatParam(res.parameter, p.value)}</TableCell>
                            <TableCell>{formatMs(p.elapsedMs)}</TableCell>
                            <TableCell>{i === 0 ? "—" : `×${(p.elapsedMs / res.points[i - 1].elapsedMs).toFixed(1)}`}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {res.truncated && <p className="text-xs text-sev-medium">Stopped early: the time budget ran out.</p>}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
