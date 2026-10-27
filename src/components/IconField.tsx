import type { LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Props {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: LucideIcon;
  placeholder?: string;
  optional?: boolean;
}

/** Labelled URL-style input with an optional leading icon. */
export default function IconField({ id, label, value, onChange, icon: Icon, placeholder, optional }: Props) {
  return (
    <div className="grid min-w-[min(200px,100%)] flex-[1_1_240px] gap-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label} {optional && <span className="font-normal">(optional)</span>}
      </Label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />}
        <Input
          id={id}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={Icon ? "h-10 pl-9" : "h-10"}
        />
      </div>
    </div>
  );
}
