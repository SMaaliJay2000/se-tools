import { CircleAlert, CircleCheck, Cookie, EyeOff, FileCode2, Info, Lock, Network, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Category, Severity } from "@/types";
import { SEVERITY_LABEL } from "@/types";

// Full class strings so Tailwind can see them at build time.
export const SEV_TONE: Record<Severity, string> = {
  critical: "text-sev-critical bg-sev-critical/10",
  high: "text-sev-high bg-sev-high/10",
  medium: "text-sev-medium bg-sev-medium/10",
  low: "text-sev-low bg-sev-low/10",
  info: "text-sev-info bg-sev-info/10",
  pass: "text-sev-pass bg-sev-pass/10",
};

export const SEV_RAIL: Record<Severity, string> = {
  critical: "border-l-sev-critical",
  high: "border-l-sev-high",
  medium: "border-l-sev-medium",
  low: "border-l-sev-low",
  info: "border-l-sev-info",
  pass: "border-l-sev-pass",
};

export const SEV_FILL: Record<Severity, string> = {
  critical: "fill-sev-critical bg-sev-critical",
  high: "fill-sev-high bg-sev-high",
  medium: "fill-sev-medium bg-sev-medium",
  low: "fill-sev-low bg-sev-low",
  info: "fill-sev-info bg-sev-info",
  pass: "fill-sev-pass bg-sev-pass",
};

const GRADE_TONE: Record<string, string> = {
  A: "text-sev-pass",
  B: "text-sev-low",
  C: "text-sev-medium",
  D: "text-sev-high",
  F: "text-sev-critical",
};
export const gradeTone = (grade: string) => GRADE_TONE[grade[0]] ?? "text-muted-foreground";

const SEV_ICON: Record<Severity, LucideIcon> = {
  critical: OctagonAlert,
  high: TriangleAlert,
  medium: CircleAlert,
  low: Info,
  info: Info,
  pass: CircleCheck,
};

export const CAT_ICON: Record<Category, LucideIcon> = {
  transport: Lock,
  headers: FileCode2,
  cookies: Cookie,
  cors: Network,
  disclosure: EyeOff,
};

export function SeverityBadge({ s, className }: { s: Severity; className?: string }) {
  const Icon = SEV_ICON[s];
  return (
    <Badge className={cn("border-transparent font-semibold", SEV_TONE[s], className)}>
      <Icon aria-hidden="true" />
      {SEVERITY_LABEL[s]}
    </Badge>
  );
}
