import { useState } from "react";
import { CircleAlert, GitCompareArrows, ScanSearch, ShieldCheck, ShieldHalf } from "lucide-react";
import { scan } from "./api";
import type { ScanResult } from "./types";
import { addToHistory, clearHistory, loadHistory, removeFromHistory, type HistoryEntry } from "./history";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ScanForm from "./components/ScanForm";
import Report from "./components/Report";
import History from "./components/History";
import Compare from "./components/Compare";
import Features from "./components/Features";

type Mode = "scan" | "compare";

function Intro({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6 grid gap-3">
      <Badge variant="secondary" className="bg-primary/10 text-primary">
        <ShieldHalf aria-hidden="true" /> Security headers · Cookies · CORS
      </Badge>
      <h1 className="max-w-[24ch] text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      <p className="max-w-[62ch] text-muted-foreground">{children}</p>
    </div>
  );
}

export default function App() {
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
    <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)} className="mx-auto flex min-h-screen max-w-[1440px] flex-col gap-0 px-4 pb-8 sm:px-6 lg:px-10">
      <header className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-4 border-b bg-background/80 px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <div className="flex items-center gap-2.5 text-lg font-bold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-sev-low text-primary-foreground shadow-sm">
            <ShieldCheck className="size-5" aria-hidden="true" />
          </span>
          Header Check
        </div>
        <TabsList className="h-9 rounded-full">
          <TabsTrigger value="scan" className="rounded-full px-3"><ScanSearch aria-hidden="true" /> Scan</TabsTrigger>
          <TabsTrigger value="compare" className="rounded-full px-3"><GitCompareArrows aria-hidden="true" /> Compare</TabsTrigger>
        </TabsList>
      </header>

      <main className="grid flex-1 content-start gap-8 pt-9 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <TabsContent value="scan">
            <Intro title="Is your site sending the right security headers?">
              Paste a URL to check its security headers, cookies and CORS policy. Each problem comes with a fix for Express, ASP.NET Core, nginx or IIS.
            </Intro>
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
            <Intro title="Compare two environments">
              Scan staging and production side by side and see which checks and headers differ.
            </Intro>
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
      </main>

      <footer className="mt-14 border-t pt-4 text-sm text-muted-foreground">
        Scans send a few ordinary requests to the target and never read page content. Only scan sites you own or have permission to test.
      </footer>
    </Tabs>
  );
}
