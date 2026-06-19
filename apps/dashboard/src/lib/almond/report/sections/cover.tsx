// The cover PDF section (Almond hardening, T3b): the first thing a grower (or their banker) reads.
// It LEADS WITH THE MONEY honestly: the Terra mark, the farm name, the as-of date, and the single
// biggest opportunity stated in dollars - the SAME figure the dashboard ACT card shows, because both
// read analyzeFarm's topFinding. Below it sit two supporting totals (loaded spend, demand charge),
// also summed from the analysis, so the cover and the dashboard can never disagree. Money is present
// and legible but the farm NAME is still the largest type (the north-star rule); the hero figure sits
// at the heading scale, never a screaming hero. When no dollar opportunity is on file the cover states
// that plainly (heroNone) and never invents a figure.
//
// Pure presentation under the existing "nodejs" runtime via pure-JS @react-pdf/renderer (no Chromium,
// no Puppeteer). The hero line and stat values are authored in the exported `coverView`, so a test
// asserts the exact strings without parsing PDF bytes; the component only lays them out.

import { Text, View } from "@react-pdf/renderer";
import { en } from "@/copy/en";
import { formatUsd } from "@/lib/format/money";
import { styles } from "../theme";
import type { CoverSectionData } from "./types";

const t = en.shell.almond.report.cover;

/** The cover's authored display: the as-of line, the hero line and its optional rate-move detail, and
 *  the two supporting stat tiles. Every dollar is formatted once here through the shared formatUsd; a
 *  null opportunity yields the honest heroNone line and no detail. Exported so a test asserts the exact
 *  strings without reading PDF bytes. */
export function coverView(data: CoverSectionData): {
  asOf: string;
  hero: string;
  heroDetail: string | null;
  stats: { label: string; value: string }[];
} {
  const asOf = data.asOf === null ? t.asOfNone : t.asOf(data.asOf);

  let hero: string;
  let heroDetail: string | null = null;
  if (data.hero === null) {
    hero = t.heroNone;
  } else if (data.hero.isRateSwitch) {
    hero = t.hero(data.hero.meterName, formatUsd(data.hero.amountCents));
    // Name the rate move when both ends are known; otherwise just the target (never a fabricated end).
    if (data.hero.currentRate !== null && data.hero.suggestedRate !== null) {
      heroDetail = t.heroRate(data.hero.currentRate, data.hero.suggestedRate);
    } else if (data.hero.suggestedRate !== null) {
      heroDetail = t.heroRateTo(data.hero.suggestedRate);
    }
  } else {
    // A dollar finding that is not a rate switch (a demand spike, a bill to check): money worth a look.
    hero = t.heroNonRate(data.hero.meterName, formatUsd(data.hero.amountCents));
  }

  const spend = data.totalSpendCents === null ? t.spendNone : formatUsd(data.totalSpendCents);
  const demand = data.totalDemandCents === null ? t.demandNone : formatUsd(data.totalDemandCents);

  return {
    asOf,
    hero,
    heroDetail,
    stats: [
      { label: t.spendLabel, value: spend },
      { label: t.demandLabel, value: demand },
    ],
  };
}

/** The cover section. The farm name is the largest type; the hero opportunity is a measured figure in
 *  the savings green below it, then the two supporting totals. Never a screaming hero number. */
export function CoverSection({ data }: { data: CoverSectionData }) {
  const { asOf, hero, heroDetail, stats } = coverView(data);
  return (
    <View style={styles.cover}>
      <Text style={styles.coverMark}>{t.eyebrow}</Text>
      <Text style={styles.coverHeading}>{t.heading(data.farmName)}</Text>
      <Text style={styles.muted}>{asOf}</Text>
      <Text style={styles.heroLabel}>{t.heroLabel}</Text>
      <Text style={styles.heroValue}>{hero}</Text>
      {heroDetail !== null ? <Text style={styles.heroDetail}>{heroDetail}</Text> : null}
      <View style={styles.statRow}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.stat}>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
