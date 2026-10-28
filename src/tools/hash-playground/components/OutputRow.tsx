import CopyButton from "@/components/CopyButton";

/** A labelled monospace value with a copy button. */
export default function OutputRow({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <CopyButton text={value} />
      </div>
      <code className="block rounded-lg bg-muted px-3 py-2 font-mono text-[0.82rem] [overflow-wrap:anywhere]">{value}</code>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
