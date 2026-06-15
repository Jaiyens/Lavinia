import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Nav } from "@/components/nav";
import { Spark } from "@/components/spark";
import { en } from "@/copy/en";
import { prisma } from "@/lib/db";
import { farmConnectionSummary, farmGasMeterCount } from "@/lib/onboarding/farm";

export const metadata: Metadata = {
  title: "Connected · Pump Timing · Terra",
};

// Reads the database, so never prerender at build time.
export const dynamic = "force-dynamic";

const usd = (n: number): string =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);

// Billing starts are stored at UTC midnight of the cycle's first day; format in UTC
// so the month does not slip when the server runs in Pacific time.
const monthYear = (d: Date): string =>
  d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

export default async function ConnectedPage({
  searchParams,
}: {
  searchParams: Promise<{ farm?: string }>;
}) {
  const { farm: farmId } = await searchParams;
  if (!farmId) notFound();

  const farm = await farmConnectionSummary(prisma, farmId);
  if (!farm) notFound();

  const c = en.onboarding.connected;

  // Gas meters are carried by the normalizer but not persisted; recompute the count
  // from this farm's own pull (live for a real customer, sample otherwise) so the
  // "set aside" note is honest.
  const gasCount = await farmGasMeterCount(prisma, farmId);

  const bills = farm.pumps.flatMap((p) => p.billingPeriods);
  const billTotals = bills
    .map((b) => b.totalBillUsd)
    .filter((t): t is number => t !== null);
  const low = billTotals.length ? Math.min(...billTotals) : null;
  const high = billTotals.length ? Math.max(...billTotals) : null;

  return (
    <main className="min-h-[100svh]">
      <Nav variant="solid" />
      <section className="px-6 py-14 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="mb-3 flex items-center gap-2.5">
            <Spark className="text-accent size-5" />
            <span className="label-caps text-muted">{c.eyebrow}</span>
          </div>
          <h1 className="font-display text-[clamp(2.2rem,5vw,3.4rem)] leading-tight text-balance">
            {c.title}
          </h1>
          <p className="text-muted mt-4 max-w-xl text-lg leading-relaxed text-pretty">
            {c.intro(farm.pumps.length, bills.length)}
          </p>

          {farm.pumps.length === 0 ? (
            <p className="text-muted mt-10">{c.empty}</p>
          ) : (
            <div className="mt-10 space-y-6">
              {farm.pumps.map((pump) => {
                const pumpTotals = pump.billingPeriods
                  .map((b) => b.totalBillUsd)
                  .filter((t): t is number => t !== null);
                const pLow = pumpTotals.length ? Math.min(...pumpTotals) : null;
                const pHigh = pumpTotals.length ? Math.max(...pumpTotals) : null;
                return (
                  <div
                    key={pump.id}
                    className="border-border bg-card rounded-2xl border p-6"
                  >
                    <h2 className="font-display text-2xl">{pump.name}</h2>

                    <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 font-mono text-sm">
                      <Field label={c.accountLabel} value={pump.account?.number ?? "n/a"} />
                      <Field label={c.saIdLabel} value={pump.serviceId ?? "n/a"} />
                      <Field label={c.serialLabel} value={pump.meterSerial ?? "n/a"} />
                      <Field label={c.rateLabel} value={pump.rateSchedule ?? "n/a"} />
                      <Field label={c.fuelLabel} value={pump.fuel} />
                    </dl>

                    {pump.billingPeriods.length > 0 ? (
                      <div className="mt-6">
                        <p className="label-caps text-muted">{c.billsTitle}</p>
                        <p className="text-foreground/70 mt-1 text-sm">
                          {pLow !== null && pHigh !== null
                            ? c.billsRange(
                                pump.billingPeriods.length,
                                usd(pLow),
                                usd(pHigh),
                              )
                            : `${pump.billingPeriods.length}`}
                        </p>
                        <ul className="border-border mt-3 divide-y divide-border/60 border-t">
                          {pump.billingPeriods.map((b) => (
                            <li
                              key={b.id}
                              className="flex items-center justify-between py-2 font-mono text-sm tabular-nums"
                            >
                              <span className="text-muted">{monthYear(b.start)}</span>
                              <span>
                                {b.totalBillUsd !== null
                                  ? usd(b.totalBillUsd)
                                  : c.cycleNoTotal}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {gasCount > 0 ? (
                <p className="text-faint text-sm leading-relaxed">{c.gasNote(gasCount)}</p>
              ) : null}
            </div>
          )}

          <div className="mt-10">
            <Link
              href="/dashboard/pump-timing"
              className="bg-accent text-background label-caps inline-block rounded-full px-6 py-3 transition-opacity hover:opacity-90"
            >
              {c.cta} <span aria-hidden>→</span>
            </Link>
          </div>
          {low !== null && high !== null ? (
            <p className="text-faint mt-4 font-mono text-xs tabular-nums">
              {bills.length} bills, {usd(low)} to {usd(high)} per cycle
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="label-caps text-faint">{label}</dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}
