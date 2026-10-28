import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import CopyButton from "@/components/CopyButton";
import { api } from "../api";
import ByteViz from "../components/ByteViz";
import EncodedBreakdown from "../components/EncodedBreakdown";
import Field from "../components/Field";
import { ErrorNotice, WarningNotices } from "../components/Notices";
import ParamControl from "../components/ParamControl";
import Segmented from "@/components/Segmented";
import SnippetViewer from "../components/SnippetViewer";
import { useCatalog } from "../CatalogContext";
import { useAction } from "@/hooks/useAction";
import { diffCount, formatMs, formatParam } from "../lib/format";
import { passwordSpec } from "../snippets/templates";
import type { Params, PasswordAlgorithm, PasswordHashResponse } from "../types";

const defaultsOf = (a: PasswordAlgorithm): Params => Object.fromEntries(a.parameters.map((p) => [p.name, p.default]));

export default function PasswordPanel({ onHashed }: { onHashed: (encoded: string) => void }) {
  const { passwords } = useCatalog();
  const [algorithmId, setAlgorithmId] = useState(passwords[0].id);
  const algorithm = passwords.find((p) => p.id === algorithmId) ?? passwords[0];

  // key= resets parameters and history when switching algorithm
  return <HashForm key={algorithm.id} algorithm={algorithm} all={passwords} onSelect={setAlgorithmId} onHashed={onHashed} />;
}

function HashForm({ algorithm, all, onSelect, onHashed }: { algorithm: PasswordAlgorithm; all: PasswordAlgorithm[]; onSelect: (id: string) => void; onHashed: (encoded: string) => void }) {
  const [password, setPassword] = useState("correct horse battery staple");
  const [reveal, setReveal] = useState(false);
  const [params, setParams] = useState<Params>(() => defaultsOf(algorithm));
  const [history, setHistory] = useState<PasswordHashResponse[]>([]);
  const { error, loading, run } = useAction(api.hashPassword);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await run({ algorithm: algorithm.id, password, parameters: params });
    if (result) {
      setHistory((h) => [result, ...h].slice(0, 3));
      onHashed(result.encoded);
    }
  };

  const latest = history[0];
  const previous = history[1];
  const spec = passwordSpec(algorithm.id, params);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Password hashing</CardTitle>
          <CardDescription>{algorithm.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <Segmented label="Algorithm" value={algorithm.id} onChange={onSelect} options={all.map((a) => ({ id: a.id, label: a.displayName }))} />
            <Field label="Password">
              <div className="flex gap-2">
                <Input type={reveal ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" spellCheck={false} />
                <Button type="button" variant="outline" onClick={() => setReveal((r) => !r)}>{reveal ? "Hide" : "Show"}</Button>
              </div>
            </Field>
            {algorithm.parameters.map((p) => (
              <ParamControl key={p.name} spec={p} value={params[p.name]} onChange={(v) => setParams({ ...params, [p.name]: v })} />
            ))}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={loading || !password}>{loading ? "Hashing…" : history.length ? "Hash again (new salt)" : "Hash password"}</Button>
              <span className="text-xs text-muted-foreground">Format: <code className="font-mono">{algorithm.formatExample}</code></span>
            </div>
            <ErrorNotice message={error} />
          </form>
        </CardContent>
      </Card>

      {latest && (
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
            <CardAction><Badge variant="secondary" className="font-mono">{formatMs(latest.elapsedMs)}</Badge></CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            <WarningNotices items={latest.warnings} />
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Encoded hash (store this string)</span>
                <CopyButton text={latest.encoded} />
              </div>
              <EncodedBreakdown encoded={latest.encoded} />
              <p className="text-xs text-muted-foreground">
                Parameters: {Object.entries(latest.parameters).map(([k, v]) => `${k}=${formatParam(k, v)}`).join(", ")}. The salt and parameters live inside the string, so verification needs nothing else.
              </p>
            </div>
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <ByteViz hex={latest.salt.hex} label="Salt (random, public)" />
              <ByteViz hex={latest.hash.hex} label="Hash (derived)" />
            </div>
          </CardContent>
        </Card>
      )}

      {previous && latest && (
        <Card>
          <CardHeader><CardTitle>Why salts matter</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <p>
              Same password, two runs: the salts differ and so do <strong>{diffCount(latest.hash.hex, previous.hash.hex)} of {latest.hash.length}</strong> hash bytes. An attacker cannot precompute one table for everyone, and equal passwords no
              longer look equal in your database.
            </p>
            <ul className="m-0 grid list-none gap-1 p-0 text-xs">
              {history.map((h, i) => (
                <li key={h.encoded} className="[overflow-wrap:anywhere]">
                  <span className="text-muted-foreground">{i === 0 ? "latest" : `#${history.length - i}`}</span> <code className="font-mono">{h.salt.hex}</code> → <code className="font-mono">{h.hash.hex.slice(0, 24)}…</code>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {spec && <SnippetViewer spec={spec} />}
    </div>
  );
}
