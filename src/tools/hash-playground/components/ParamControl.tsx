import { Input } from "@/components/ui/input";
import { formatParam } from "../lib/format";
import type { ParameterSpec } from "../types";

/** Wide ranges (memory, iterations) use a log slider so each step feels proportional; narrow ones (bcrypt cost) stay linear. */
const isLog = (s: ParameterSpec) => s.max / s.min > 100;
const toSlider = (s: ParameterSpec, v: number) => (isLog(s) ? Math.log(v / s.min) / Math.log(s.max / s.min) : (v - s.min) / (s.max - s.min));
const fromSlider = (s: ParameterSpec, t: number) => (isLog(s) ? Math.round(s.min * (s.max / s.min) ** t) : Math.round(s.min + t * (s.max - s.min)));

export default function ParamControl({ spec, value, onChange }: { spec: ParameterSpec; value: number; onChange: (v: number) => void }) {
  const clamp = (v: number) => Math.min(spec.max, Math.max(spec.min, v));
  return (
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium">
          {spec.label} <span className="font-normal text-muted-foreground">({spec.unit})</span>
        </span>
        <output className="font-mono text-sm font-semibold">{formatParam(spec.name, value)}</output>
      </div>
      <div className="grid items-center gap-3 sm:grid-cols-[1fr_8rem]">
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={toSlider(spec, value)}
          aria-label={`${spec.label} slider`}
          className="w-full accent-primary"
          onChange={(e) => onChange(clamp(fromSlider(spec, Number(e.target.value))))}
        />
        <Input type="number" min={spec.min} max={spec.max} value={value} aria-label={spec.label} onChange={(e) => onChange(clamp(Number(e.target.value) || spec.min))} />
      </div>
      <p className="text-xs text-muted-foreground">{spec.hint}</p>
    </div>
  );
}
