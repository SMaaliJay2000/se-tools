import { useEffect, useState } from "react";
import { CircleAlert, Fingerprint, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PageIntro from "@/components/PageIntro";
import { navigate } from "@/lib/router";
import type { ToolProps } from "../registry";
import { api } from "./api";
import { CatalogProvider } from "./CatalogContext";
import AesGcmPanel from "./panels/AesGcmPanel";
import BenchmarkPanel from "./panels/BenchmarkPanel";
import DigestPanel from "./panels/DigestPanel";
import HmacPanel from "./panels/HmacPanel";
import PasswordPanel from "./panels/PasswordPanel";
import TuningPanel from "./panels/TuningPanel";
import VerifyPanel from "./panels/VerifyPanel";
import type { Catalog } from "./types";

const TABS = [
  { id: "sha", label: "SHA-2" },
  { id: "hmac", label: "HMAC" },
  { id: "password", label: "Password hashing" },
  { id: "verify", label: "Verify hash" },
  { id: "aes", label: "AES-GCM" },
  { id: "benchmark", label: "Benchmark" },
  { id: "tuning", label: "Tuning guide" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function HashPlaygroundTool({ subPath }: ToolProps) {
  const tab: TabId = TABS.find((t) => t.id === subPath[0])?.id ?? "sha";
  const [catalog, setCatalog] = useState<Catalog>();
  const [loadError, setLoadError] = useState<string>();
  // Lifted so "Verify hash" can offer the hash just generated on the Password tab.
  const [lastHash, setLastHash] = useState("");

  useEffect(() => {
    api.algorithms().then(setCatalog, (e: Error) => setLoadError(e.message));
  }, []);

  return (
    <div className="grid gap-6">
      <PageIntro badge="SHA-2 · HMAC · bcrypt · Argon2id · AES-GCM" icon={Fingerprint} title="Hash, derive and encrypt, then see what happens">
        Run the algorithms, tune their cost, tamper with ciphertext, and copy equivalent code for C#, Node.js, Python, Java, Go and PHP.
      </PageIntro>

      <Alert role="note" className="-mt-2">
        <TriangleAlert aria-hidden="true" />
        <AlertDescription>Learning tool: inputs are sent to the API in plain text and nothing is stored. Never enter real passwords, keys or secrets.</AlertDescription>
      </Alert>

      <Tabs value={tab} onValueChange={(v) => navigate(`/hash-playground/${v}`)} className="gap-6">
        <TabsList aria-label="Sections" className="h-auto flex-wrap justify-start">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="px-3 py-1.5">{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {loadError && (
          <Alert variant="destructive">
            <CircleAlert aria-hidden="true" />
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}
        {!catalog && !loadError && (
          <div className="grid gap-3" role="status">
            <span className="sr-only">Loading algorithms…</span>
            <Skeleton className="h-48 rounded-xl" />
          </div>
        )}
        {catalog && (
          <CatalogProvider value={catalog}>
            <TabsContent value="sha"><DigestPanel /></TabsContent>
            <TabsContent value="hmac"><HmacPanel /></TabsContent>
            <TabsContent value="password"><PasswordPanel onHashed={setLastHash} /></TabsContent>
            <TabsContent value="verify"><VerifyPanel lastHash={lastHash} /></TabsContent>
            <TabsContent value="aes"><AesGcmPanel /></TabsContent>
            <TabsContent value="benchmark"><BenchmarkPanel /></TabsContent>
            <TabsContent value="tuning"><TuningPanel /></TabsContent>
          </CatalogProvider>
        )}
      </Tabs>
    </div>
  );
}
