import { Clock, History as HistoryIcon, Trash2, X } from "lucide-react";
import type { HistoryEntry } from "../history";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { gradeTone } from "../lib/severity";

interface Props {
  items: HistoryEntry[];
  activeId: string | null;
  onOpen: (e: HistoryEntry) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export default function History({ items, activeId, onOpen, onRemove, onClear }: Props) {
  return (
    <Card className="self-start lg:sticky lg:top-20" aria-label="Scan history" role="complementary">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 font-semibold">
          <HistoryIcon className="size-4 text-primary" aria-hidden="true" /> Recent scans
        </CardTitle>
        {items.length > 0 && (
          <CardAction>
            <Button variant="ghost" size="xs" className="text-muted-foreground hover:text-destructive" onClick={onClear}>
              <Trash2 aria-hidden="true" /> Clear all
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="px-2">
        {items.length === 0 ? (
          <div className="grid justify-items-center gap-2.5 px-2 py-5 text-center text-muted-foreground">
            <Clock className="size-7" aria-hidden="true" />
            <p className="text-sm">Scans you run are kept in this browser. Nothing is stored on the server.</p>
          </div>
        ) : (
          <ul className="grid gap-0.5">
            {items.map((h) => (
              <li key={h.id} className={cn("group flex items-center rounded-lg transition-colors hover:bg-muted", h.id === activeId && "bg-primary/10 hover:bg-primary/10")}>
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 p-2 text-left" onClick={() => onOpen(h)}>
                  <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg bg-current/10 text-sm font-extrabold", gradeTone(h.result.score.grade))}>
                    {h.result.score.grade}
                  </span>
                  <span className="grid min-w-0">
                    <span className="truncate text-sm font-medium">{new URL(h.result.finalUrl).host}</span>
                    <span className="text-xs text-muted-foreground">{new Date(h.result.scannedAt).toLocaleString()}</span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="mr-1 text-muted-foreground opacity-100 hover:text-destructive focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                  aria-label={`Remove ${h.result.url}`}
                  onClick={() => onRemove(h.id)}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
