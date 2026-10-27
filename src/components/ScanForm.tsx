import { useState } from "react";
import { Globe, LoaderCircle, Monitor, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import IconField from "./IconField";

interface Props {
  busy: boolean;
  onScan: (url: string, origin: string) => void;
}

export default function ScanForm({ busy, onScan }: Props) {
  const [url, setUrl] = useState("");
  const [origin, setOrigin] = useState("");
  return (
    <Card className="p-4">
      <form
        className="flex flex-wrap items-end gap-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) onScan(url.trim(), origin.trim());
        }}
      >
        <IconField id="url" label="Site or API URL" icon={Globe} placeholder="api.example.com/health" value={url} onChange={setUrl} />
        <IconField id="origin" label="Your frontend origin" optional icon={Monitor} placeholder="https://app.example.com" value={origin} onChange={setOrigin} />
        <Button type="submit" size="lg" className="h-10 px-5" disabled={busy || !url.trim()}>
          {busy ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
          {busy ? "Scanning…" : "Scan"}
        </Button>
      </form>
    </Card>
  );
}
