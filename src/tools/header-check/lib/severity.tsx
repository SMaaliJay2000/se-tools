import { Cookie, EyeOff, FileCode2, Lock, Network, type LucideIcon } from "lucide-react";
import type { Category } from "../types";

// Severity/grade styling is shared: see src/lib/severity.tsx.
export const CAT_ICON: Record<Category, LucideIcon> = {
  transport: Lock,
  headers: FileCode2,
  cookies: Cookie,
  cors: Network,
  disclosure: EyeOff,
};
