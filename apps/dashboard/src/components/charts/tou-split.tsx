// The peak / partial-peak / off-peak energy split for one cycle, as a single horizontal
// stacked bar. Server component, no dependency. v1 models two TOU buckets (peak 4-9pm and
// off-peak); partial-peak carries 0 kWh until that window is modeled, so the band is shown
// only when it has usage and is otherwise called out honestly rather than drawn as zero.

import { cn } from "@/lib/cn";
import { kwh } from "@/copy/en";

export function TouSplit({
  peakKwh,
  partialPeakKwh,
  offPeakKwh,
}: {
  peakKwh: number;
  partialPeakKwh: number;
  offPeakKwh: number;
}) {
  const total = peakKwh + partialPeakKwh + offPeakKwh || 1;
  const seg = (v: number) => `${(v / total) * 100}%`;

  const bands: { label: string; kwhVal: number; className: string; dot: string }[] = [
    { label: "Peak 4 to 9pm", kwhVal: peakKwh, className: "bg-green-deep", dot: "bg-green-deep" },
    ...(partialPeakKwh > 0
      ? [{ label: "Partial-peak", kwhVal: partialPeakKwh, className: "bg-green/70", dot: "bg-green/70" }]
      : []),
    { label: "Off-peak", kwhVal: offPeakKwh, className: "bg-green-deep/35", dot: "bg-green-deep/35" },
  ];

  return (
    <div>
      <div className="border-line flex h-7 w-full overflow-hidden rounded-full border" role="img" aria-label="Energy split by time of use">
        {bands.map((b) =>
          b.kwhVal > 0 ? <div key={b.label} className={b.className} style={{ width: seg(b.kwhVal) }} /> : null,
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {bands.map((b) => (
          <span key={b.label} className="text-muted inline-flex items-center gap-2 text-sm">
            <span className={cn("size-2.5 rounded-full", b.dot)} />
            {b.label}
            <span className="tnum text-ink/70 font-mono text-xs">{kwh(b.kwhVal)}</span>
          </span>
        ))}
      </div>
      {partialPeakKwh === 0 ? (
        <p className="text-faint mt-2 text-xs leading-relaxed">
          Partial-peak is not modeled on this rate yet, so it reads as zero.
        </p>
      ) : null}
    </div>
  );
}
