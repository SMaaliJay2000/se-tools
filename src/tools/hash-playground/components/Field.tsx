import { cn } from "@/lib/utils";

/** Label + control + optional hint. The control is nested in the label, so no ids are needed. */
export default function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1.5", className)}>
      <label className="grid gap-1.5">
        <span className="text-sm leading-none font-medium">{label}</span>
        {children}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
