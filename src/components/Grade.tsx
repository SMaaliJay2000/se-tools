import { cn } from "@/lib/utils";
import { SEVERITIES, SEVERITY_LABEL, SEV_FILL, gradeTone, type Score } from "@/lib/severity";

/**
 * Grade ring plus a stacked bar of findings by severity.
 * The bar is SVG so widths can be set as attributes: the app's CSP forbids inline style attributes.
 */
export default function Grade({ score }: { score: Score }) {
  const present = SEVERITIES.filter((s) => score.counts[s] > 0);
  const total = present.reduce((n, s) => n + score.counts[s], 0) || 1;
  let x = 0;
  const rects = present.map((s) => {
    const w = (score.counts[s] / total) * 100;
    const r = <rect key={s} className={SEV_FILL[s]} x={x} y={0} width={Math.max(w - 0.8, 0.5)} height={10} />;
    x += w;
    return r;
  });
  return (
    <div className="flex items-center gap-5">
      <div
        className={cn("grid size-24 shrink-0 place-items-center rounded-full bg-current/10 text-4xl font-extrabold tracking-tighter ring-4 ring-current/30 md:size-28 md:text-5xl", gradeTone(score.grade))}
        aria-label={`Grade ${score.grade}`}
      >
        {score.grade}
      </div>
      <div className="grid min-w-48 gap-2">
        <p className="text-muted-foreground">
          <strong className="text-2xl font-bold text-foreground">{score.value}</strong> out of 100
        </p>
        <svg className="block h-2.5 w-full overflow-hidden rounded-full" viewBox="0 0 100 10" preserveAspectRatio="none" role="img"
          aria-label={present.map((s) => `${score.counts[s]} ${SEVERITY_LABEL[s]}`).join(", ")}>
          {rects}
        </svg>
        <ul className="flex flex-wrap gap-x-3.5 gap-y-1 text-sm text-muted-foreground">
          {present.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <i className={cn("inline-block size-2 rounded-full", SEV_FILL[s])} />
              {score.counts[s]} {SEVERITY_LABEL[s].toLowerCase()}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
