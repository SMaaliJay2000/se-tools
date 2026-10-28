import { useState } from "react";
import { CircleAlert, GitCompareArrows, ScanSearch, ShieldHalf } from "lucide-react";
import { scan } from "./api";
import type { ScanResult } from "./types";
import { addToHistory, clearHistory, loadHistory, removeFromHistory, type HistoryEntry } from "./history";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageIntro from "@/components/PageIntro";
import ScanForm from "./components/ScanForm";
import Report from "./components/Report";
import History from "./components/History";
import Compare from "./components/Compare";
import Features from "./components/Features";

type Mode = "scan" | "compare";

export default function HeaderCheckTool() {
  const [mode, setMode] = useState<Mode>("scan");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(loadHistory);
  const [activeId, setActiveId] = useState<string | null>(null);

  const onScan = async (url: string, origin: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await scan(url, origin);
      setResult(r);
      setActiveId(`${r.scannedAt}-${r.url}`);
      setHistory((h) => addToHistory(h, r));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="gap-0">
      <div className="grid content-start gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <TabsList className="mb-6 h-9 rounded-full">
            <TabsTrigger value="scan" className="rounded-full px-3"><ScanSearch aria-hidden="true" /> Scan</TabsTrigger>
            <TabsTrigger value="compare" className="rounded-full px-3"><GitCompareArrows aria-hidden="true" /> Compare</TabsTrigger>
          </TabsList>
          <TabsContent value="scan">
            <PageIntro badge="Security headers · Cookies · CORS" icon={ShieldHalf} title="Is your site sending the right security headers?">
              Paste a URL to check its security headers, cookies and CORS policy. Each problem comes with a fix for Express, ASP.NET Core, nginx or IIS.
            </PageIntro>
            <ScanForm busy={busy} onScan={onScan} />
            {error && (
              <Alert variant="destructive" className="mt-4">
                <CircleAlert aria-hidden="true" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {busy && (
              <div className="mt-7 grid gap-3" role="status">
                <span className="sr-only">Fetching headers and testing CORS…</span>
                <Skeleton className="h-36 rounded-xl" />
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
              </div>
            )}
            {result && !busy && <Report r={result} />}
            {!result && !busy && <Features />}
          </TabsContent>
          <TabsContent value="compare">
            <PageIntro badge="Security headers · Cookies · CORS" icon={ShieldHalf} title="Compare two environments">
              Scan staging and production side by side and see which checks and headers differ.
            </PageIntro>
            <Compare onSaved={(r) => setHistory((h) => addToHistory(h, r))} />
          </TabsContent>
        </div>
        <History
          items={history}
          activeId={activeId}
          onOpen={(h) => {
            setMode("scan");
            setResult(h.result);
            setActiveId(h.id);
            setError(null);
            window.scrollTo({ top: 0 });
          }}
          onRemove={(id) => setHistory((h) => removeFromHistory(h, id))}
          onClear={() => setHistory(clearHistory())}
        />
      </div>

      <p className="mt-14 border-t pt-4 text-sm text-muted-foreground">
        Scans send a few ordinary requests to the target and never read page content. Only scan sites you own or have permission to test.
      </p>
    </Tabs>
  );
}
