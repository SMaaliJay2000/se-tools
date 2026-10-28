import CopyButton from "@/components/CopyButton";
import { cn } from "@/lib/utils";

/** Monospace snippet with a copy button. Shared by every tool that shows code. */
export default function CodeBlock({ code, className }: { code: string; className?: string }) {
  return (
    <div className={cn("relative min-w-0", className)}>
      <CopyButton text={code} className="absolute top-2 right-2" />
      <pre className="m-0 overflow-x-auto rounded-lg border bg-muted/60 p-3.5 pr-20 font-mono text-[0.82rem] leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}
