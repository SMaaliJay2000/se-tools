import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "../api";
import ByteViz from "../components/ByteViz";
import EncodingSelect from "../components/EncodingSelect";
import Field from "../components/Field";
import { ErrorNotice } from "../components/Notices";
import OutputRow from "../components/OutputRow";
import Segmented from "@/components/Segmented";
import SnippetViewer from "../components/SnippetViewer";
import { useCatalog } from "../CatalogContext";
import { useAction } from "@/hooks/useAction";
import type { Encoding } from "../types";
import { shaLabel } from "./DigestPanel";

export default function HmacPanel() {
  const { hmacs } = useCatalog();
  const [algorithm, setAlgorithm] = useState(hmacs[0]);
  const [key, setKey] = useState("Jefe");
  const [keyEncoding, setKeyEncoding] = useState<Encoding>("utf8");
  const [message, setMessage] = useState("what do ya want for nothing?");
  const [messageEncoding, setMessageEncoding] = useState<Encoding>("utf8");
  const { data, error, loading, run } = useAction(api.hmac);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run({ algorithm, key, keyEncoding, message, messageEncoding });
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>HMAC</CardTitle>
          <CardDescription>The defaults are RFC 4231 test case 2; expect 5bdcc146…ec3843 for SHA-256.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <Segmented label="Hash function" value={algorithm} onChange={setAlgorithm} options={hmacs.map((d) => ({ id: d, label: `HMAC-${shaLabel(d)}` }))} />
            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
              <Field label="Secret key">
                <Input value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />
              </Field>
              <Field label="Key is">
                <EncodingSelect label="Key encoding" value={keyEncoding} onChange={setKeyEncoding} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
              <Field label="Message">
                <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} className="font-mono" />
              </Field>
              <Field label="Message is">
                <EncodingSelect label="Message encoding" value={messageEncoding} onChange={setMessageEncoding} />
              </Field>
            </div>
            <Button type="submit" className="justify-self-start" disabled={loading || !key}>{loading ? "Computing…" : "Compute HMAC"}</Button>
            <ErrorNotice message={error} />
          </form>
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardHeader><CardTitle>Result</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <OutputRow label="MAC (hex)" value={data.mac.hex} />
            <OutputRow label="MAC (base64)" value={data.mac.base64} />
            <ByteViz hex={data.mac.hex} label="MAC" />
          </CardContent>
        </Card>
      )}

      <SnippetViewer spec={{ kind: "hmac", hash: algorithm }} />
    </div>
  );
}
