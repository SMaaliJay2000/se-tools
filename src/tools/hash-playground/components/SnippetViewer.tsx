import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CodeBlock from "@/components/CodeBlock";
import { loadPref, savePref } from "../lib/format";
import { buildSnippets, STACKS, type SnippetSpec, type Stack } from "../snippets/templates";

const PREF_KEY = "hashplayground.stack";

/** "Do the same in your stack": the operation just performed, as code for each mainstream backend. */
export default function SnippetViewer({ spec }: { spec: SnippetSpec }) {
  const [stack, setStack] = useState<Stack>(() => {
    const saved = loadPref(PREF_KEY, "csharp");
    return STACKS.some((s) => s.id === saved) ? (saved as Stack) : "csharp";
  });
  const snippets = useMemo(() => buildSnippets(spec), [spec]);

  const pick = (s: string) => {
    setStack(s as Stack);
    savePref(PREF_KEY, s);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Same thing in your stack</CardTitle>
        <CardDescription>Equivalent code for the operation above, with your current parameters.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={stack} onValueChange={pick} className="min-w-0 gap-2">
          <TabsList aria-label="Language" className="h-auto flex-wrap justify-start">
            {STACKS.map((s) => (
              <TabsTrigger key={s.id} value={s.id} className="px-3 py-1.5">{s.label}</TabsTrigger>
            ))}
          </TabsList>
          {STACKS.map((s) => (
            <TabsContent key={s.id} value={s.id} className="grid gap-2">
              <CodeBlock code={snippets[s.id].code} />
              <p className="text-xs text-muted-foreground">{snippets[s.id].note}</p>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
