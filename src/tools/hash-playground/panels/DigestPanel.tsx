import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

export const shaLabel = (id: string) => id.toUpperCase().replace("SHA", "SHA-");

export default function DigestPanel() {
  const { digests } = useCatalog();
  const [algorithm, setAlgorithm] = useState(digests[0]);
  const [input, setInput] = useState("hello world");
  const [encoding, setEncoding] = useState<Encoding>("utf8");
  const { data, error, loading, run } = useAction(api.digest);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run({ algorithm, input, inputEncoding: encoding });
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>SHA-2 digest</CardTitle>
          <CardDescription>Change one character and about half of the output bits flip (the avalanche effect).</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="grid gap-4">
            <Segmented label="Algorithm" value={algorithm} onChange={setAlgorithm} options={digests.map((d) => ({ id: d, label: shaLabel(d) }))} />
            <Field label="Input">
              <Textarea rows={4} value={input} onChange={(e) => setInput(e.target.value)} className="font-mono" />
            </Field>
            <Field label="Interpret input as" className="sm:max-w-xs">
              <EncodingSelect label="Input encoding" value={encoding} onChange={setEncoding} />
            </Field>
            <Button type="submit" className="justify-self-start" disabled={loading}>{loading ? "Hashing…" : "Compute digest"}</Button>
            <ErrorNotice message={error} />
          </form>
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardHeader><CardTitle>Result</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <OutputRow label="Hex" value={data.digest.hex} note={`${data.inputLength} input bytes → ${data.digest.length} bytes`} />
            <OutputRow label="Base64" value={data.digest.base64} />
            <ByteViz hex={data.digest.hex} label="Digest" />
          </CardContent>
        </Card>
      )}

      <SnippetViewer spec={{ kind: "digest", hash: algorithm }} />
    </div>
  );
}
