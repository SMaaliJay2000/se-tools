import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Encoding } from "../types";

const OPTIONS: { id: Encoding; label: string }[] = [
  { id: "utf8", label: "Text (UTF-8)" },
  { id: "hex", label: "Hex bytes" },
  { id: "base64", label: "Base64 bytes" },
];

export default function EncodingSelect({ value, onChange, label }: { value: Encoding; onChange: (e: Encoding) => void; label: string }) {
  return (
    <NativeSelect className="w-full" aria-label={label} value={value} onChange={(e) => onChange(e.target.value as Encoding)}>
      {OPTIONS.map((o) => (
        <NativeSelectOption key={o.id} value={o.id}>{o.label}</NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
