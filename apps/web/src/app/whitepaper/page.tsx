import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AuroraText, TERRA_AURORA_DEEP } from "@/components/ui/aurora-text";
import { DotPattern } from "@/components/ui/dot-pattern";
import { PrintButton } from "@/components/ui/PrintButton";
import { tractionStats } from "@/lib/site";

export const metadata: Metadata = {
  title: "White Paper",
  description:
    "The farm data problem: why growers lose money they cannot see, why regulation is compounding the cost, and how Terra detects and prevents both.",
};

const toc = [
  { id: "summary", label: "Executive summary" },
  { id: "pain-point", label: "The pain point" },
  { id: "regulations", label: "The regulatory burden" },
  { id: "case-study", label: "Case study: demand charges" },
  { id: "detect-prevent", label: "Detection and prevention" },
  { id: "terra", label: "Where Terra stands" },
];

const regulations = [
  {
    name: "Groundwater: SGMA",
    body: "The Sustainable Groundwater Management Act requires overdrafted basins to reach sustainability. In practice that means metered wells, pumping allocations, per-acre-foot fees, and extraction reports filed with the local groundwater agency. Basins that fall short face state intervention and steeper fees. A grower who cannot show when and how much each well pumped is exposed on every one of those fronts.",
  },
  {
    name: "Pesticides: full use reporting",
    body: "California requires every agricultural pesticide application to be reported to the county agricultural commissioner monthly: product, rate, acreage, location, date, and applicator. Restricted materials require a permit and a notice of intent before the application happens. Each missed or inaccurate report is a separate violation, and violations carry per-incident fines.",
  },
  {
    name: "Nitrogen: the Irrigated Lands program",
    body: "Growers in the Central Valley file certified nitrogen management plans and annual summary reports through their water coalition. The numbers have to reconcile: fertilizer purchased, applied, and removed with the crop. Today those numbers are reconstructed from receipts and memory at the deadline.",
  },
  {
    name: "Labor: overtime and heat rules",
    body: "Agricultural overtime now begins at 8 hours a day in California, and Cal/OSHA requires a written heat illness prevention plan with training records, shade, water, and rest logs. Hour tracking that lives on paper time cards becomes a liability the moment an inspector or a lawyer asks for it.",
  },
  {
    name: "Food safety: FSMA",
    body: "The federal Produce Safety Rule adds water testing, soil amendment records, worker training logs, and traceability requirements, enforced through inspections. Buyers increasingly demand the same documentation on top of the law.",
  },
];

export default function WhitePaper() {
  return (
    <>
      <Header />
      <main className="flex-1">
        {/* title block */}
        <section className="relative overflow-hidden pb-14 pt-32 sm:pb-16 sm:pt-40">
          <DotPattern className="fill-accent-600/10 [mask-image:radial-gradient(55%_70%_at_50%_30%,#000,transparent)]" />
          <div className="container-x relative">
            <p className="eyebrow">Terra White Paper · 2026</p>
            <h1 className="mt-5 max-w-4xl text-balance text-4xl font-semibold leading-[1.06] tracking-tight text-ink sm:text-6xl">
              <AuroraText colors={TERRA_AURORA_DEEP}>The farm data problem.</AuroraText>
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-ink-soft">
              Why growers lose money they cannot see, why regulation is
              compounding the cost, and how Terra detects and prevents both.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <PrintButton />
              <Link
                href="/#inquire"
                className="press cta-pill inline-flex items-center gap-1.5 rounded-full px-5 py-2.5 text-sm font-semibold print:hidden"
              >
                Inquire
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </section>

        <div className="container-x grid gap-12 pb-24 sm:pb-32 lg:grid-cols-[13rem_minmax(0,1fr)]">
          {/* table of contents */}
          <nav aria-label="Contents" className="hidden lg:block print:hidden">
            <div className="sticky top-24">
              <p className="eyebrow">Contents</p>
              <ol className="mt-4 space-y-2.5 text-sm">
                {toc.map((t, i) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className="text-ink-mute transition-colors hover:text-ink"
                    >
                      <span className="fig-label mr-2">{String(i + 1).padStart(2, "0")}</span>
                      {t.label}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>

          {/* paper body */}
          <article className="max-w-2xl">
            <section id="summary" className="scroll-mt-24">
              <p className="fig-label">01</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Executive summary
              </h2>
              <div className="mt-5 space-y-4 text-[1.02rem] leading-relaxed text-ink-soft">
                <p>
                  An American farm is a business that runs on records it never
                  connects. Utility bills, pump logs, spray records, payroll,
                  agronomy spreadsheets, and water meters each live in their own
                  silo, and the physical state of the field is barely recorded
                  at all. Problems surface as bills and yield losses, weeks or
                  months after the moment they could have been fixed.
                </p>
                <p>
                  At the same time, the regulatory load on a farm has grown
                  into a second full-time job. Groundwater, pesticides,
                  nitrogen, labor, and food safety each report to a different
                  agency on a different calendar, with fines for every miss.
                  The reporting is data work, performed by hand, from paper.
                </p>
                <p>
                  Terra is an AI-native operating system for farms. The Brain
                  connects the operation&apos;s fragmented data into one layer and
                  acts on it within the grower&apos;s control. The Eyes are
                  computer-vision cameras that capture what is physically
                  happening, acre by acre. Together they are detective and
                  preventative at once: they catch the problem the day it
                  happens and act before it becomes a cost, a violation, or a
                  lost harvest.
                </p>
              </div>
            </section>

            <section id="pain-point" className="mt-14 scroll-mt-24">
              <p className="fig-label">02</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                The pain point
              </h2>
              <div className="mt-5 space-y-4 text-[1.02rem] leading-relaxed text-ink-soft">
                <p>
                  Globally, about 40 percent of crop production is lost to
                  pests and disease every year, more than $220 billion in
                  value. Pesticide use meant to fight that loss carries its own
                  bill: roughly $10 billion a year in environmental and health
                  damage in the United States alone. Both numbers share a root
                  cause. Decisions are made without current, complete
                  information about the field.
                </p>
                <p>
                  The information problem has two halves. First, the data a
                  farm already produces is disconnected. The PG&amp;E bill does
                  not know about the irrigation schedule. The spray log does
                  not know about the weather record. The payroll system does
                  not know who was in which block. No single view of the
                  operation exists, so expensive errors hide in the seams
                  between systems.
                </p>
                <p>
                  Second, the most important data is never captured. A tractor
                  pass sees every tree in the row; almost none of that
                  observation survives the day. Pest pressure, water stress,
                  missing fruit, a stuck valve: by the time these are obvious
                  enough to notice from a truck window, the money is already
                  gone. Margins leave no room for that lag. Input costs have
                  climbed while commodity prices have not, and water in much of
                  California is now metered and capped.
                </p>
              </div>
            </section>

            <section id="regulations" className="mt-14 scroll-mt-24">
              <p className="fig-label">03</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                The regulatory burden
              </h2>
              <div className="mt-5 space-y-4 text-[1.02rem] leading-relaxed text-ink-soft">
                <p>
                  California grows more food than any other state and regulates
                  farming more heavily than any other state. A single Central
                  Valley operation answers to the county agricultural
                  commissioner, the regional water board, its groundwater
                  sustainability agency, Cal/OSHA, and the FDA, each with its
                  own reports, deadlines, and penalties.
                </p>
              </div>
              <div className="mt-7 space-y-5">
                {regulations.map((r) => (
                  <div key={r.name} className="rounded-2xl border border-line bg-white p-6">
                    <h3 className="font-semibold tracking-tight text-ink">{r.name}</h3>
                    <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-mute">{r.body}</p>
                  </div>
                ))}
              </div>
              <div className="mt-7 space-y-4 text-[1.02rem] leading-relaxed text-ink-soft">
                <p>
                  The process is as costly as the rules. Each report draws on
                  records kept in a different place, on a different calendar,
                  by a different person. Compliance becomes an end-of-month
                  reconstruction: pulling receipts, reading meters, calling the
                  applicator, and hoping the numbers line up. The work is
                  cumbersome precisely because it is detective work performed
                  by hand, after the fact, under a deadline.
                </p>
                <p>
                  Here is the opening: every one of those reports is built from
                  data the farm already generates. The burden is not the
                  farming. It is the capture and connection of the data, and
                  that is a software problem.
                </p>
              </div>
            </section>

            <section id="case-study" className="mt-14 scroll-mt-24">
              <p className="fig-label">04</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Case study: PG&amp;E demand charges
              </h2>
              <div className="mt-5 space-y-4 text-[1.02rem] leading-relaxed text-ink-soft">
                <p>
                  Agricultural electric rates include a demand charge: a fee
                  set not by how much energy the farm used, but by its single
                  highest draw during the billing month. The rate also varies
                  by time of day, with a peak window in the late afternoon and
                  evening priced far above the rest.
                </p>
                <p>
                  The failure mode is simple and brutal. A well pump is started
                  a few minutes early, or a foreman runs it during the peak
                  window because that is when he got to it. Those minutes set
                  the maximum-demand line for the entire month. The farm pays
                  $3,000 or more for a month in which the same water, pumped a
                  few hours later, would have cost around $200. Nothing on the
                  farm looks wrong. The error is invisible until the bill
                  arrives weeks later, and by then the next billing cycle may
                  already be compromised too. Repeated across an irrigation
                  season, one bad habit on one meter is a five-figure loss, and
                  most farms run many meters.
                </p>
                <p>
                  Terra closes that loop in three moves. It reads what the farm
                  already has: the utility bill, the pump schedule, and the
                  logs the operation keeps anyway. It detects the mistimed
                  start the day it happens by reconciling pump activity against
                  the rate calendar, and flags the billing cycle that is now
                  affected. And it prevents the repeat: it recommends start
                  times that stay out of the peak window and alerts before the
                  next window opens, so the penalty rate never locks in again.
                </p>
                <p>
                  Demand charges are one example of a wider class. Water
                  allocations, spray windows, overtime thresholds, and report
                  deadlines all share the same shape: a timing rule, a record
                  that exists somewhere on the farm, and a cost that lands only
                  when the two are never compared. A system that compares them
                  continuously turns every one of these from a recurring
                  penalty into a solved problem.
                </p>
              </div>
            </section>

            <section id="detect-prevent" className="mt-14 scroll-mt-24">
              <p className="fig-label">05</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Detection and prevention
              </h2>
              <div className="mt-5 space-y-4 text-[1.02rem] leading-relaxed text-ink-soft">
                <p>
                  Asked whether Terra is a detective tool or a preventative
                  one, the answer is both, and the order matters. Detection
                  without prevention is a report card on money already lost.
                  Prevention without detection is a guess. Terra runs both on
                  the same data.
                </p>
                <p>
                  Detection is the Eyes and the Brain working together. Cameras
                  capture ground truth from every acre: what is growing, what
                  is stressed, what is missing. The Brain reads every bill,
                  log, and meter and reconciles them against each other. The
                  result is that problems are caught the day they happen, with
                  a record attached.
                </p>
                <p>
                  Prevention is what that record makes possible. The same
                  system surfaces the report before the deadline, flags the
                  application that would break a rule before it is sprayed, and
                  times the pump so the penalty rate never applies. And because
                  every action is captured as it happens, the documentation
                  regulators demand becomes a byproduct of operating rather
                  than a month-end reconstruction. The audit trail writes
                  itself.
                </p>
              </div>
            </section>

            <section id="terra" className="mt-14 scroll-mt-24">
              <p className="fig-label">06</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                Where Terra stands
              </h2>
              <div className="mt-5 space-y-4 text-[1.02rem] leading-relaxed text-ink-soft">
                <p>
                  Terra is built in Fresno for the largest agricultural county
                  in America, and it sells the way farming actually works:
                  grower to grower.
                </p>
              </div>
              <div className="mt-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
                {tractionStats.map((s) => (
                  <div key={s.label} className="rounded-2xl border border-line bg-white p-5">
                    <span className="block text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
                      {s.value}
                    </span>
                    <span className="mt-1.5 block text-xs leading-snug text-ink-mute sm:text-sm">
                      {s.label}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-8 print:hidden">
                <Link
                  href="/#inquire"
                  className="press cta-pill inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold"
                >
                  Talk to the founders
                  <ArrowRight size={15} />
                </Link>
              </div>
            </section>
          </article>
        </div>
      </main>
      <Footer />
    </>
  );
}
