import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Single-choice pill group (a TabsList without panels). */
export default function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsList aria-label={label} className="h-auto flex-wrap justify-start">
        {options.map((o) => (
          <TabsTrigger key={o.id} value={o.id} className="px-3 py-1.5">{o.label}</TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
