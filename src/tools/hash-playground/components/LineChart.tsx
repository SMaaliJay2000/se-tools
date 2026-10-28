export interface ChartPoint {
  label: string;
  y: number;
}

const W = 360;
const H = 220;
const PAD = { l: 46, r: 12, t: 14, b: 38 };

/** Log-scale line chart (milliseconds) with an optional dashed target line. Pass shared [yMin, yMax] to compare charts side by side. */
export default function LineChart({ points, yMin, yMax, targetMs, title }: { points: ChartPoint[]; yMin: number; yMax: number; targetMs?: number; title: string }) {
  const lo = Math.floor(Math.log10(Math.max(yMin, 0.1)));
  const hi = Math.max(lo + 1, Math.ceil(Math.log10(yMax)));
  const yPos = (v: number) => PAD.t + (1 - (Math.log10(Math.max(v, 0.1)) - lo) / (hi - lo)) * (H - PAD.t - PAD.b);
  const xPos = (i: number) => (points.length === 1 ? (W + PAD.l - PAD.r) / 2 : PAD.l + (i / (points.length - 1)) * (W - PAD.l - PAD.r));
  const decades = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);

  return (
    <svg className="h-auto w-full" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      {decades.map((d) => (
        <g key={d}>
          <line x1={PAD.l} x2={W - PAD.r} y1={yPos(10 ** d)} y2={yPos(10 ** d)} className="stroke-border" strokeWidth={1} />
          <text x={PAD.l - 6} y={yPos(10 ** d) + 3} textAnchor="end" fontSize={10} className="fill-muted-foreground">
            {10 ** d >= 1000 ? `${10 ** d / 1000}s` : `${10 ** d}ms`}
          </text>
        </g>
      ))}
      {targetMs !== undefined && targetMs >= 10 ** lo && targetMs <= 10 ** hi && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={yPos(targetMs)} y2={yPos(targetMs)} className="stroke-sev-critical" strokeWidth={1.2} strokeDasharray="5 4" />
          <text x={W - PAD.r} y={yPos(targetMs) - 4} textAnchor="end" fontSize={10} className="fill-sev-critical">
            target {targetMs} ms
          </text>
        </g>
      )}
      <polyline className="fill-none stroke-primary" strokeWidth={2} points={points.map((p, i) => `${xPos(i)},${yPos(p.y)}`).join(" ")} />
      {points.map((p, i) => (
        <g key={p.label}>
          <circle cx={xPos(i)} cy={yPos(p.y)} r={4} className="fill-primary">
            <title>{`${p.label}: ${p.y < 10 ? p.y.toFixed(1) : Math.round(p.y)} ms`}</title>
          </circle>
          <text x={xPos(i)} y={H - PAD.b + 16} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
