import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../api";
import ByteViz from "../components/ByteViz";
import Field from "../components/Field";
import { ErrorNotice, WarningNotices } from "../components/Notices";
import OutputRow from "../components/OutputRow";
import SnippetViewer from "../components/SnippetViewer";
import { useAction } from "../hooks/useAction";
import { flipFirstBit } from "../lib/format";
import type { AesGcmEncryptResponse } from "../types";

export default function AesGcmPanel() {
  const [plaintext, setPlaintext] = useState("Transfer $100 to account 12345");
  const [aad, setAad] = useState("user=42");
  const [key, setKey] = useState("");
  const [iv, setIv] = useState("");
  const enc = useAction(api.encrypt);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void enc.run({ plaintext, aad: aad || undefined, key: key || undefined, iv: iv || undefined });
  };
  const result = enc.data;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>AES-GCM encrypt</CardTitle>
          <CardDescription>Authenticated encryption: confidentiality plus tamper detection in one operation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <Field label="Plaintext">
              <Textarea rows={3} value={plaintext} onChange={(e) => setPlaintext(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Additional authenticated data (AAD)" hint="Not encrypted, but bound to the tag: decryption fails if it differs. Use it for headers, user ids, versions.">
              <Input value={aad} onChange={(e) => setAad(e.target.value)} spellCheck={false} className="font-mono" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Key (base64, optional)" hint="16, 24 or 32 bytes. Blank generates a fresh 256-bit key.">
                <Input value={key} onChange={(e) => setKey(e.target.value)} spellCheck={false} autoComplete="off" className="font-mono" />
              </Field>
              <Field label="IV (base64, optional)" hint="12 bytes. Leave blank: the server generates a random one.">
                <Input value={iv} onChange={(e) => setIv(e.target.value)} spellCheck={false} autoComplete="off" className="font-mono" />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" disabled={enc.loading}>{enc.loading ? "Encrypting…" : result ? "Encrypt again" : "Encrypt"}</Button>
              {result && <Button type="button" variant="outline" onClick={() => setKey(result.key.base64)}>Reuse this key</Button>}
            </div>
            <ErrorNotice message={enc.error} />
          </form>
        </CardContent>
      </Card>

      {result && (
        <>
          <Card>
            <CardHeader><CardTitle>Encrypted output</CardTitle></CardHeader>
            <CardContent className="grid gap-4">
              <WarningNotices items={result.warnings} />
              <OutputRow label="Key (base64)" value={result.key.base64} note="Keep secret. Anyone with it can decrypt and forge." />
              <OutputRow label="IV / nonce (base64)" value={result.iv.base64} note="Public. Must be unique per message under one key." />
              <OutputRow label="Ciphertext (base64)" value={result.ciphertext.base64} />
              <OutputRow label="Auth tag (base64)" value={result.tag.base64} />
              <OutputRow label="Combined: iv ‖ ciphertext ‖ tag (base64)" value={result.combined.base64} note={`${result.combined.length} bytes: 12 + ${result.ciphertext.length} + 16`} />
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <ByteViz hex={result.iv.hex} label="IV (random per message)" />
                <ByteViz hex={result.tag.hex} label="Auth tag" />
              </div>
              <ByteViz hex={result.ciphertext.hex} label="Ciphertext" />
              <p className="text-xs text-muted-foreground">Press “Encrypt again” with the same key: plaintext and key are unchanged, yet a new IV makes every byte of the ciphertext different.</p>
            </CardContent>
          </Card>
          <DecryptCard result={result} aad={aad} />
        </>
      )}

      <SnippetViewer spec={{ kind: "aesgcm" }} />
    </div>
  );
}

function DecryptCard({ result, aad }: { result: AesGcmEncryptResponse; aad: string }) {
  const [fields, setFields] = useState({ key: "", iv: "", ciphertext: "", tag: "", aad: "" });
  const dec = useAction(api.decrypt);
  const { reset } = dec;

  // Each fresh encryption refills the decrypt form so the round trip works out of the box.
  useEffect(() => {
    setFields({ key: result.key.base64, iv: result.iv.base64, ciphertext: result.ciphertext.base64, tag: result.tag.base64, aad });
    reset();
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps -- refill only on a new encryption, not on every AAD keystroke

  // Any edit invalidates the previous verdict.
  const update = (next: typeof fields) => {
    setFields(next);
    reset();
  };
  const set = (name: keyof typeof fields) => (e: { target: { value: string } }) => update({ ...fields, [name]: e.target.value });

  return (
    <Card>
      <CardHeader>
        <CardTitle>AES-GCM decrypt &amp; tamper test</CardTitle>
        <CardDescription>GCM authenticates before releasing any plaintext: one flipped bit anywhere, or the wrong key, IV or AAD, and decryption refuses.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Key (base64)"><Input value={fields.key} onChange={set("key")} spellCheck={false} className="font-mono" /></Field>
          <Field label="IV (base64)"><Input value={fields.iv} onChange={set("iv")} spellCheck={false} className="font-mono" /></Field>
        </div>
        <Field label="Ciphertext (base64)"><Input value={fields.ciphertext} onChange={set("ciphertext")} spellCheck={false} className="font-mono" /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Auth tag (base64)"><Input value={fields.tag} onChange={set("tag")} spellCheck={false} className="font-mono" /></Field>
          <Field label="AAD"><Input value={fields.aad} onChange={set("aad")} spellCheck={false} className="font-mono" /></Field>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" disabled={dec.loading} onClick={() => void dec.run({ ...fields, aad: fields.aad || undefined })}>Decrypt</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => update({ ...fields, ciphertext: flipFirstBit(fields.ciphertext) })}>Tamper: flip 1 bit of ciphertext</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => update({ ...fields, aad: fields.aad + "!" })}>Tamper: change AAD</Button>
        </div>
        <ErrorNotice message={dec.error} />
        {dec.data && (
          <p role="status" className="m-0 rounded-lg bg-sev-pass/10 px-3.5 py-2.5 font-semibold text-sev-pass">
            ✓ Authenticated. Plaintext: {dec.data.text ?? `(binary) ${dec.data.plaintext.hex}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
