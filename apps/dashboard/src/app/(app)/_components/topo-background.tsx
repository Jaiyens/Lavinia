// A faded, slowly-drifting wave texture for the dashboard background (the look the user shared),
// in Terra green. Horizontal wavy lines that span the screen and flow gently sideways. Fixed
// behind all content, decorative only (aria-hidden, pointer-events-none), and frozen under
// prefers-reduced-motion by the global motion guard. Pure SVG + one CSS keyframe, no dependency.

// Each line is drawn across two 1200-unit tiles (viewBox 0..2400). The wave repeats every tile,
// so the .topo-line animation can shift the 200vw-wide layer by one 100vw tile seamlessly.
const TILE = 1200;
const WIDTH = TILE * 2;
const STEP = 20;

function wavePath(baseY: number, amp: number, periods: number, phase: number): string {
  let d = "";
  for (let x = 0; x <= WIDTH; x += STEP) {
    const y = baseY + amp * Math.sin((2 * Math.PI * periods * x) / TILE + phase);
    d += x === 0 ? `M ${x} ${y.toFixed(1)}` : ` L ${x} ${y.toFixed(1)}`;
  }
  return d;
}

type LineConfig = {
  baseY: number;
  amp: number;
  periods: number;
  phase: number;
  dur: string;
  reverse: boolean;
};

const CONFIGS: LineConfig[] = [
  { baseY: 70, amp: 22, periods: 2, phase: 0, dur: "34s", reverse: false },
  { baseY: 160, amp: 30, periods: 3, phase: 1, dur: "44s", reverse: true },
  { baseY: 250, amp: 18, periods: 2, phase: 2, dur: "29s", reverse: false },
  { baseY: 340, amp: 34, periods: 3, phase: 3, dur: "50s", reverse: true },
  { baseY: 430, amp: 24, periods: 2, phase: 0.5, dur: "38s", reverse: false },
  { baseY: 520, amp: 30, periods: 3, phase: 1.5, dur: "46s", reverse: true },
  { baseY: 610, amp: 20, periods: 2, phase: 2.5, dur: "32s", reverse: false },
  { baseY: 700, amp: 28, periods: 3, phase: 3.5, dur: "48s", reverse: true },
];

// Paths are computed once at module load (deterministic, no per-render cost).
const LINES = CONFIGS.map((c) => ({ ...c, d: wavePath(c.baseY, c.amp, c.periods, c.phase) }));

export function TopoBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden opacity-[0.05]"
      style={{ color: "var(--green-deep)" }}
    >
      {LINES.map((line, i) => (
        <div
          key={i}
          className="topo-line absolute inset-y-0 left-0 h-full w-[200vw]"
          style={{ animationDuration: line.dur, animationDirection: line.reverse ? "reverse" : "normal" }}
        >
          <svg width="100%" height="100%" viewBox="0 0 2400 800" preserveAspectRatio="none" fill="none">
            <path
              d={line.d}
              stroke="currentColor"
              strokeWidth={1}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
      ))}
    </div>
  );
}
