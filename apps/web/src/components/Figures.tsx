/**
 * Isometric wireframe figures, thin line-art on a light background,
 * drawn with currentColor so they inherit the surrounding text color.
 */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
  vectorEffect: "non-scaling-stroke" as const,
};

const faintFill = "rgba(9,9,11,0.025)";

function rhombus(cx: number, cy: number, hw: number, qh: number) {
  return `${cx},${cy - qh} ${cx + hw},${cy} ${cx},${cy + qh} ${cx - hw},${cy}`;
}

/* FIG, Unified data layer: a stack of plates with a striped disc on top */
export function FigureLayers({ className }: { className?: string }) {
  const cx = 140;
  const hw = 84;
  const qh = 48;
  const plates = [108, 130, 152, 174];
  const top = plates[0];
  const bottom = plates[plates.length - 1];
  return (
    <svg viewBox="0 0 280 240" className={className} aria-hidden role="img">
      {/* side walls */}
      <polygon
        points={`${cx - hw},${top} ${cx},${top + qh} ${cx + hw},${top} ${cx + hw},${bottom} ${cx},${bottom + qh} ${cx - hw},${bottom}`}
        fill={faintFill}
        stroke="none"
      />
      {plates.map((cy) => (
        <polygon key={cy} points={rhombus(cx, cy, hw, qh)} {...stroke} />
      ))}
      <line x1={cx - hw} y1={top} x2={cx - hw} y2={bottom} {...stroke} />
      <line x1={cx + hw} y1={top} x2={cx + hw} y2={bottom} {...stroke} />
      <line x1={cx} y1={top + qh} x2={cx} y2={bottom + qh} {...stroke} />
      {/* striped disc on top */}
      <ellipse cx={cx} cy={top - 10} rx={46} ry={26} {...stroke} fill={faintFill} />
      <path d={`M ${cx - 38} ${top - 14} Q ${cx} ${top - 2} ${cx + 38} ${top - 14}`} {...stroke} />
      <path d={`M ${cx - 30} ${top - 20} Q ${cx} ${top - 10} ${cx + 30} ${top - 20}`} {...stroke} />
    </svg>
  );
}

/* FIG, AI agents: a cluster of isometric cubes of varying height */
export function FigureAgents({ className }: { className?: string }) {
  function Cube(cx: number, cy: number, hw: number, qh: number, h: number, key: string) {
    const L = [cx - hw, cy];
    const R = [cx + hw, cy];
    const B = [cx, cy + qh];
    return (
      <g key={key}>
        {/* top */}
        <polygon points={rhombus(cx, cy, hw, qh)} {...stroke} fill={faintFill} />
        {/* left face */}
        <polygon
          points={`${L[0]},${L[1]} ${B[0]},${B[1]} ${B[0]},${B[1] + h} ${L[0]},${L[1] + h}`}
          {...stroke}
          fill={faintFill}
        />
        {/* right face */}
        <polygon
          points={`${B[0]},${B[1]} ${R[0]},${R[1]} ${R[0]},${R[1] + h} ${B[0]},${B[1] + h}`}
          {...stroke}
          fill="none"
        />
        {/* tiny port marker on top */}
        <circle cx={cx + hw * 0.45} cy={cy - qh * 0.3} r={2.2} fill="currentColor" stroke="none" />
      </g>
    );
  }
  return (
    <svg viewBox="0 0 280 240" className={className} aria-hidden role="img">
      {Cube(108, 92, 42, 24, 44, "back")}
      {Cube(170, 110, 38, 22, 60, "right")}
      {Cube(120, 140, 46, 26, 50, "front")}
    </svg>
  );
}

/* FIG, Computer vision: a fan of thin blades scanning across the field */
export function FigureScan({ className }: { className?: string }) {
  const blades = Array.from({ length: 10 }, (_, i) => {
    const bx = 56 + i * 15;
    const by = 178 - i * 6;
    const h = 34 + i * 9.5;
    const d = 9;
    return (
      <g key={i}>
        <polygon
          points={`${bx},${by} ${bx + d},${by + d / 2} ${bx + d},${by + d / 2 - h} ${bx},${by - h}`}
          {...stroke}
          fill={i % 2 ? faintFill : "none"}
        />
        <line x1={bx} y1={by - h} x2={bx + d} y2={by + d / 2 - h} {...stroke} />
      </g>
    );
  });
  return (
    <svg viewBox="0 0 280 240" className={className} aria-hidden role="img">
      {blades}
    </svg>
  );
}
