import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { api } from "../api";
import Field from "../components/Field";
import { ErrorNotice } from "../components/Notices";
import { useAction } from "@/hooks/useAction";
import { formatMs, formatParam } from "../lib/format";

// Hashes produced by other stacks: verifying them here shows the formats are interoperable.
const SAMPLES = [
  { label: "bcryptjs (Node)", encoded: "$2b$10$Y4gEWQ6IYAlhKFbjs5rwT.EsBDOjDreTQwY4oIpfzCYlEeQwmfrMC" },
  { label: "argon2-cffi (Python)", encoded: "$argon2id$v=19$m=19456,t=2,p=1$2nTnxFHuOo3Sc8dZb0ldBw$9UTxr1+Vz182Sa8INo/O43PRH8T07C3tzYT8Yd1l9xI" },
];
const SAMPLE_PASSWORD = "correct horse battery staple";

export default function VerifyPanel({ lastHash }: { lastHash: string }) {
  const [password, setPassword] = useState(SAMPLE_PASSWORD);
  const [encoded, setEncoded] = useState(lastHash);
  const { data, error, loading, run, reset } = useAction(api.verifyPassword);

  // Picking a new hash (or editing the password) invalidates the previous verdict.
  useEffect(reset, [encoded, password, reset]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run({ password, encoded });
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Verify a password against a stored hash</CardTitle>
          <CardDescription>bcrypt ($2a$/$2b$/$2y$), Argon2id ($argon2id$) or PBKDF2 ($pbkdf2-sha256$). The algorithm is detected from the prefix.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <Field label="Stored hash">
              <Textarea rows={3} value={encoded} onChange={(e) => setEncoded(e.target.value)} spellCheck={false} className="font-mono" placeholder="Paste a hash, use the last one you generated, or load a sample" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" disabled={!lastHash} onClick={() => setEncoded(lastHash)}>Use last generated hash</Button>
              {SAMPLES.map((s) => (
                <Button
                  key={s.label}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setEncoded(s.encoded);
                    setPassword(SAMPLE_PASSWORD);
                  }}
                >
                  Sample: {s.label}
                </Button>
              ))}
            </div>
            <Field label="Password to check">
              <Input value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" spellCheck={false} />
            </Field>
            <Button type="submit" className="justify-self-start" disabled={loading || !encoded.trim() || !password}>{loading ? "Verifying…" : "Verify"}</Button>
            <ErrorNotice message={error} />
          </form>
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardHeader>
            <CardTitle>Verdict</CardTitle>
            <CardAction><Badge variant="secondary" className="font-mono">{formatMs(data.elapsedMs)}</Badge></CardAction>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p role="status" className={cn("m-0 rounded-lg px-3.5 py-2.5 font-semibold", data.valid ? "bg-sev-pass/10 text-sev-pass" : "bg-sev-critical/10 text-sev-critical")}>
              {data.valid ? "✓ Password matches" : "✗ Password does not match"}
            </p>
            <p className="text-muted-foreground">
              Detected <strong className="text-foreground">{data.algorithm}</strong> with {Object.entries(data.parameters).map(([k, v]) => `${k}=${formatParam(k, v)}`).join(", ")}. The server re-derived the hash using the salt and cost
              embedded in the string and compared in constant time.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
