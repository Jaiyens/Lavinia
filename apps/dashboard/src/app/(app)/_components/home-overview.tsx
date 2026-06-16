import Link from "next/link";
import { ArrowRight, Zap, Droplets, Users } from "lucide-react";
import { sessionUserId } from "@/lib/auth";
import { en } from "@/copy/en";
import { formatUsdWhole } from "@/lib/format/money";
import { cn } from "@/lib/cn";
import { cardClass } from "@/components/ui";
import { NumberTicker } from "@/components/ui/number-ticker";
import { BorderBeam } from "@/components/ui/border-beam";
import { DotPattern } from "@/components/ui/dot-pattern";
import { resolveFarm, resolveFindings, resolveMeters } from "../(dashboard)/_data";
import { Reveal } from "./shell/reveal";

// HOME: the farm known at a glance (the north star). Deliberately NOT the Energy dashboard -
// it is a calm overview that opens into the agents, so the Home and Energy tabs are now
// distinct surfaces (#7). The heavy meter table / lenses / drawer live only on /energy, which
// also keeps Home fast to switch to (#9). Animated per the Magic UI design bible (#4):
// NumberTicker stats, a BorderBeam on the live agent, a faint DotPattern field, all tinted
// into the warm green palette and gated behind prefers-reduced-motion by the components.

const GREEN = "#2fa84f";
const GOLD = "#f2c14e";

export async function HomeOverview() {
  const userId = await sessionUserId();
  // The (dashboard) layout already gated null -> /onboarding, so a farm is present here.
  // resolveFarm is request-cached, so this shares the layout's resolution (no extra query).
  const resolved = await resolveFarm(userId, false);
  if (!resolved) {
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="type-headline text-on-surface">{en.shell.noFarmTitle}</h1>
        <p className="type-body-md mt-3 text-on-surface-variant">{en.shell.noFarmBody}</p>
      </div>
    );
  }

  const { farm } = resolved;
  const [meters, findings] = await Promise.all([
    resolveMeters(farm.id),
    resolveFindings(farm.id),
  ]);

  const meterCount = meters.length;
  const accountCount = new Set(
    meters.map((m) => m.accountNumber).filter((n): n is string => n !== null),
  ).size;
  const attentionCount = findings.length;
  // findings.impactUsd is legacy float DOLLARS; sum and render rounded to whole dollars.
  const savingsDollars = findings.reduce((acc, f) => acc + (f.impactUsd ?? 0), 0);
  const savingsCents = Math.round(savingsDollars * 100);
  const topFindings = findings.slice(0, 3);

  return (
    <div className="relative py-6 lg:py-10">
      <DotPattern
        width={22}
        height={22}
        cr={1}
        className={cn(
          "pointer-events-none absolute inset-0 -z-10 h-[420px] text-primary/15",
          "[mask-image:radial-gradient(420px_circle_at_top,white,transparent)]",
        )}
      />

      <Reveal>
        <header className="mb-10">
          <p className="type-label-caps text-primary">{en.home.eyebrow}</p>
          <h1 className="type-display-lg mt-1 text-on-surface">{farm.name}</h1>
          <p className="type-body-md mt-2 text-on-surface-variant">
            {en.home.metersSummary(meterCount, accountCount)}
          </p>
        </header>

        {/* Farm at a glance: a few animated stats, never one lone screaming number. */}
        <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Stat label={en.home.stat.meters}>
            <NumberTicker value={meterCount} className="type-display-lg tnum text-on-surface" />
          </Stat>
          <Stat label={en.home.stat.attention}>
            {attentionCount > 0 ? (
              <NumberTicker
                value={attentionCount}
                className="type-display-lg tnum text-on-surface"
              />
            ) : (
              <span className="type-headline text-money-positive">{en.home.stat.allClear}</span>
            )}
          </Stat>
          <Stat label={en.home.stat.savings}>
            {savingsCents > 0 ? (
              <NumberTicker
                value={savingsCents}
                format="usdWhole"
                className="type-display-lg tnum text-money-positive"
              />
            ) : (
              <span className="type-headline text-on-surface-variant">{"-"}</span>
            )}
          </Stat>
        </div>
      </Reveal>

      <Reveal>
        <h2 className="type-label-caps mb-3 text-on-surface-variant">{en.home.agentsHeading}</h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* The live Energy agent: the hero card, with the brand BorderBeam. */}
          <Link
            href="/energy"
            className={cardClass({
              interactive: true,
              radius: "2xl",
              className: "group relative flex flex-col overflow-hidden p-6",
            })}
          >
            <BorderBeam size={120} duration={8} colorFrom={GREEN} colorTo={GOLD} />
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-container text-on-primary-container">
                <Zap size={20} aria-hidden />
              </span>
              <span className="type-title text-on-surface">{en.shell.agents.energy}</span>
            </div>
            <p className="type-body-md mt-3 text-on-surface-variant">{en.home.energyBlurb}</p>
            <div className="mt-auto flex items-center justify-between pt-6">
              <span
                className={cn(
                  "type-body-sm",
                  attentionCount > 0 ? "text-alert" : "text-on-surface-variant",
                )}
              >
                {en.home.energyAttention(attentionCount)}
              </span>
              <span className="inline-flex items-center gap-1.5 type-body-sm font-semibold text-primary">
                {en.home.energyOpen}
                <ArrowRight
                  size={16}
                  aria-hidden
                  className="transition-transform group-hover:translate-x-0.5"
                />
              </span>
            </div>
          </Link>

          {/* The agents that sell the OS but are not built yet: dimmed, non-interactive. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <ComingAgent icon={Droplets} label={en.shell.agents.water} />
            <ComingAgent icon={Users} label={en.shell.agents.labor} />
          </div>
        </div>
      </Reveal>

      {/* What needs a look: a calm preview of the top findings, opening into Energy. */}
      <Reveal>
        <div className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="type-label-caps text-on-surface-variant">{en.home.attentionHeading}</h2>
            {attentionCount > 0 && (
              <Link
                href="/energy"
                className="type-body-sm font-semibold text-primary hover:underline"
              >
                {en.home.attentionViewAll}
              </Link>
            )}
          </div>
          {topFindings.length === 0 ? (
            <p className="rounded-2xl border border-outline-variant bg-surface-container-low px-5 py-6 type-body-md text-on-surface-variant">
              {en.home.attentionEmpty}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {topFindings.map((f) => (
                <li key={f.id}>
                  <Link
                    href={f.meterId ? `/energy?meter=${f.meterId}` : "/energy"}
                    className={cardClass({
                      interactive: true,
                      className: "flex items-center justify-between gap-4 px-5 py-4",
                    })}
                  >
                    <div className="min-w-0">
                      <p className="truncate type-body-md text-on-surface">{f.situation}</p>
                      {f.meterName && (
                        <p className="truncate type-caption text-on-surface-variant">
                          {f.meterName}
                        </p>
                      )}
                    </div>
                    {f.impactUsd != null && f.impactUsd > 0 && (
                      <span className="shrink-0 type-num font-semibold text-money-positive">
                        {formatUsdWhole(Math.round(f.impactUsd * 100))}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Reveal>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={cardClass({ radius: "2xl", className: "flex flex-col p-5" })}>
      <span className="type-label-caps text-on-surface-variant">{label}</span>
      <span className="mt-2">{children}</span>
    </div>
  );
}

function ComingAgent({
  icon: Icon,
  label,
}: {
  icon: typeof Droplets;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-outline-variant bg-surface-container-low/60 p-5 text-on-surface-variant/60">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-container text-on-surface-variant/60">
        <Icon size={20} aria-hidden />
      </span>
      <span className="type-body-md">{label}</span>
      <span className="ml-auto type-label-caps text-on-surface-variant/60">
        {en.shell.comingTag}
      </span>
    </div>
  );
}
