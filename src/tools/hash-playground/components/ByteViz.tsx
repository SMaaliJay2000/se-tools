import { hexToBytes } from "../lib/format";

const CELL = 30;
const COLS = 16;

/**
 * Renders bytes as a grid of coloured cells (hue = byte value) so "random per hash" is visible:
 * two salts that look nothing alike produce hashes that look nothing alike.
 * Drawn as SVG with fill attributes, so it needs no inline styles (the CSP forbids style injection).
 */
export default function ByteViz({ hex, label }: { hex: string; label: string }) {
  const bytes = hexToBytes(hex);
  const cols = Math.min(COLS, bytes.length) || 1;
  const rows = Math.ceil(bytes.length / COLS) || 1;

  return (
    <figure className="m-0 grid gap-1">
      <svg viewBox={`0 0 ${cols * CELL} ${rows * CELL}`} role="img" aria-label={`${label}: ${bytes.length} bytes, ${hex}`} className="h-auto w-full max-w-[520px]">
        {bytes.map((b, i) => (
          <g key={i} transform={`translate(${(i % COLS) * CELL} ${Math.floor(i / COLS) * CELL})`}>
            <title>{`byte ${i}: 0x${b.toString(16).padStart(2, "0")} = ${b} = ${b.toString(2).padStart(8, "0")}`}</title>
            <rect width={CELL - 2} height={CELL - 2} rx={4} fill={`hsl(${Math.round((b / 256) * 360)} 62% 42%)`} />
            <text x={(CELL - 2) / 2} y={(CELL - 2) / 2 + 3.5} textAnchor="middle" fontSize={10} fill="#fff" fontFamily="monospace">
              {b.toString(16).padStart(2, "0")}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className="text-xs text-muted-foreground">
        {label} · {bytes.length} bytes ({bytes.length * 8} bits)
      </figcaption>
    </figure>
  );
}
