import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronRight, CircleAlert, DatabaseZap, Download, LoaderCircle, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import Grade from "@/components/Grade";
import PageIntro from "@/components/PageIntro";
import Segmented from "@/components/Segmented";
import { useAction } from "@/hooks/useAction";
import { api } from "./api";
import StatementCard from "./components/StatementCard";
import { badExample, exampleSchema, goodExample } from "./lib/examples";
import { loadPref, savePref } from "./lib/prefs";
import { CATEGORY_LABEL, type AnalyzeResult, type Category, type Options } from "./types";

const DIALECT_KEY = "sqlcheck.dialect";

function download(r: AnalyzeResult) {
  const blob = new Blob([JSON.stringify(r, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "sql-check-report.json";
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function SqlCheckTool() {
  const [options, setOptions] = useState<Options>();
  const [loadError, setLoadError] = useState<string>();
  const [dialect, setDialect] = useState(() => loadPref(DIALECT_KEY, "postgresql"));
  const [sql, setSql] = useState("");
  const [schema, setSchema] = useState("");
  const [schemaOpen, setSchemaOpen] = useState(false);
  const [category, setCategory] = useState<Category | "all">("all");
  const [hidePassed, setHidePassed] = useState(true);
  const { data, error, loading, run } = useAction(api.analyze);

  useEffect(() => {
    api.options().then(setOptions, (e: Error) => setLoadError(e.message));
  }, []);

  const pickDialect = (id: string) => {
    setDialect(id);
    savePref(DIALECT_KEY, id);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (sql.trim()) void run({ sql, dialect, schema: schema.trim() ? schema : undefined });
  };

  const categories = useMemo(() => {
    const present = new Set(data?.findings.filter((f) => f.severity !== "pass").map((f) => f.category));
    return (Object.keys(CATEGORY_LABEL) as Category[]).filter((c) => present.has(c));
  }, [data]);

  const issueCount = data ? data.findings.filter((f) => f.severity !== "pass").length : 0;
  const limits = options?.limits;

  return (
    <div className="grid gap-6">
      <PageIntro badge="Syntax · Safety · Performance" icon={DatabaseZap} title="Is your SQL safe and fast?">
        Paste one or more queries to catch syntax errors, a missing WHERE, accidental cross joins, full table scans and other optimization problems. Add your schema to get index-aware advice.
      </PageIntro>

      <Alert role="note" className="-mt-2">
        <TriangleAlert aria-hidden="true" />
        <AlertDescription>
          This is a static review: no database is queried and no execution plan is read, so treat the grade as a checklist, not a benchmark. Queries are sent to the API in plain text and never stored; leave real data and credentials out.
        </AlertDescription>
      </Alert>

      {loadError && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {!options && !loadError && <Skeleton className="h-64 rounded-xl" />}

      {options && (
        <Card>
          <CardHeader>
            <CardTitle>Queries to check</CardTitle>
            <CardDescription>Separate statements with semicolons. Up to {limits?.maxStatements} statements.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="grid gap-4">
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">SQL dialect</span>
                <Segmented label="SQL dialect" value={dialect} onChange={pickDialect} options={options.dialects.map((d) => ({ id: d.id, label: d.label }))} />
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="sql" className="text-sm font-medium">SQL</label>
                <Textarea
                  id="sql"
                  rows={10}
                  value={sql}
                  onChange={(e) => setSql(e.target.value)}
                  spellCheck={false}
                  maxLength={limits?.maxSqlChars}
                  className="font-mono"
                  placeholder={"SELECT * FROM orders WHERE LOWER(status) = 'open';\nUPDATE users SET active = false;"}
                />
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="xs" onClick={() => setSql(badExample(dialect))}>Load a bad example</Button>
                    <Button type="button" variant="outline" size="xs" onClick={() => setSql(goodExample(dialect))}>Load a good example</Button>
                    {sql && <Button type="button" variant="ghost" size="xs" onClick={() => setSql("")}>Clear</Button>}
                  </span>
                  {limits && <span>{sql.length.toLocaleString("en-US")} / {limits.maxSqlChars.toLocaleString("en-US")} characters</span>}
                </div>
              </div>

              <Collapsible open={schemaOpen} onOpenChange={setSchemaOpen}>
                <CollapsibleTrigger className="group flex items-center gap-1.5 text-sm font-medium">
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" />
                  Schema (optional){schema.trim() && <span className="font-normal text-muted-foreground">: provided</span>}
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 grid gap-1.5">
                  <Textarea
                    aria-label="Schema"
                    rows={6}
                    value={schema}
                    onChange={(e) => setSchema(e.target.value)}
                    spellCheck={false}
                    maxLength={limits?.maxSchemaChars}
                    className="font-mono"
                    placeholder={"CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT, status VARCHAR(20));\nCREATE INDEX idx_orders_status ON orders (status);"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Paste CREATE TABLE and CREATE INDEX statements to also check for unknown tables and columns, and for filters, joins and sorts that have no usable index.{" "}
                    <button type="button" className="text-primary underline-offset-4 hover:underline" onClick={() => setSchema(exampleSchema(dialect))}>Load an example schema</button>
                  </p>
                </CollapsibleContent>
              </Collapsible>

              <Button type="submit" size="lg" className="h-10 justify-self-start px-5" disabled={loading || !sql.trim()}>
                {loading ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <DatabaseZap aria-hidden="true" />}
                {loading ? "Analyzing…" : "Analyze"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {data && !loading && (
        <section aria-label="Results" className="grid gap-4">
          <Card className="flex-row flex-wrap items-center gap-8 p-6">
            <Grade score={data.score} />
            <div className="grid min-w-0 flex-[1_1_260px] justify-items-start gap-2.5">
              <h2 className="text-xl font-semibold tracking-tight">{data.score.level}</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3.5 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Statements</dt>
                <dd>{data.statements.length}</dd>
                <dt className="text-muted-foreground">Issues</dt>
                <dd>{issueCount === 0 ? "none" : `${issueCount} (${data.score.counts.critical} critical, ${data.score.counts.high} high)`}</dd>
                {data.schema && (
                  <>
                    <dt className="text-muted-foreground">Schema</dt>
                    <dd>{data.schema.tables} tables, {data.schema.indexes} indexes</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Analyzed in</dt>
                <dd>{data.durationMs} ms</dd>
              </dl>
              <Button variant="outline" size="sm" onClick={() => download(data)}><Download aria-hidden="true" /> Download JSON</Button>
            </div>
          </Card>

          {data.schema?.notices.map((n) => (
            <Alert key={n} role="note">
              <TriangleAlert aria-hidden="true" />
              <AlertDescription>{n}</AlertDescription>
            </Alert>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
              {(["all", ...categories] as (Category | "all")[]).map((key) => (
                <Button key={key} size="sm" variant={category === key ? "default" : "outline"} className="rounded-full" aria-pressed={category === key} onClick={() => setCategory(key)}>
                  {key === "all" ? "All" : CATEGORY_LABEL[key]}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2.5">
              <Switch id="hide-passed" checked={hidePassed} onCheckedChange={setHidePassed} />
              <Label htmlFor="hide-passed" className="font-normal text-muted-foreground">Hide passed checks</Label>
            </div>
          </div>

          {data.statements.map((s) => (
            <StatementCard key={s.index} s={s} category={category} showPassed={!hidePassed} />
          ))}
        </section>
      )}
    </div>
  );
}
