import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { en } from "@/copy/en";
import { cardClass } from "@/components/ui";
import type { UpcomingClose } from "@/lib/dashboard/calendar";

// The front-page billing-close surface: WHEN each meter's PG&E billing closes (the date the serial
// sets), soonest first. The thing a real grower asks to see first, so it leads the home. The soonest
// date is big; the next few close dates list below. Forecast from the read schedule, never a promise.

const t = en.shell.calendar.cycle;

// Billing closes are calendar dates stored midnight-UTC; format in UTC so a Pacific grower never
// sees a date shifted a day, and SSR/CSR text stays identical.
const fmtBig = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const fmtRow = fmtBig;
const at = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

export function BillingClosesCard({
  closes,
  energyHref,
}: {
  closes: UpcomingClose[];
  energyHref: string;
}) {
  const next = closes[0];
  const rest = closes.slice(1);

  return (
    <section className={cardClass({ radius: "2xl", className: "flex flex-col p-6" })}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
          <CalendarClock size={16} aria-hidden />
        </span>
        <span className="type-label-caps text-on-surface-variant">{t.closesEyebrow}</span>
      </div>

      {next ? (
        <>
          {/* The soonest billing close, big and unmissable. */}
          <p className="type-display-lg mt-3 text-on-surface">{fmtBig.format(at(next.closeIso))}</p>
          <p className="type-body-md text-on-surface-variant">{t.closesMeters(next.meterCount)}</p>

          {/* The next close dates after that. */}
          {rest.length > 0 && (
            <ul className="mt-4 flex flex-col border-t border-outline-variant">
              {rest.map((c) => (
                <li
                  key={c.closeIso}
                  className="flex items-baseline justify-between gap-3 border-b border-outline-variant py-2 last:border-b-0"
                >
                  <span className="type-body-md text-on-surface">{fmtRow.format(at(c.closeIso))}</span>
                  <span className="type-body-md tnum text-on-surface-variant">
                    {t.closesRowMeters(c.meterCount)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <Link
            href={`${energyHref}?lens=calendar`}
            className="mt-4 inline-flex min-h-[44px] items-center gap-1.5 type-body-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t.closesCta}
            <ArrowRight size={16} aria-hidden />
          </Link>
        </>
      ) : (
        <p className="type-body-md mt-3 text-on-surface-variant">{t.closesNone}</p>
      )}
    </section>
  );
}
