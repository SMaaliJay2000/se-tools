import { CircleAlert, TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ErrorNotice({ message }: { message?: string }) {
  return message ? (
    <Alert variant="destructive">
      <CircleAlert aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  ) : null;
}

export function WarningNotices({ items }: { items: string[] }) {
  return (
    <>
      {items.map((w) => (
        <Alert key={w} role="note" className="border-sev-medium/40 text-sev-medium">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription className="text-sev-medium">{w}</AlertDescription>
        </Alert>
      ))}
    </>
  );
}
