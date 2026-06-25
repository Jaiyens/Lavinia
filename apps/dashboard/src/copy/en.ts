// All user-facing copy. Plain language, farmer-first. No em dashes. Keep utility
// jargon (kW, 15-minute interval, coincident demand) out, translate it here.
// A later field-crew view adds es.ts (English/Spanish, run/wait only).
//
// Strings that carry numbers or names are builder functions so a later locale
// just supplies its own templates. The energy layer passes raw numbers + the
// farmer's own pump names; dollars are formatted here for one consistent style.

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

/** Whole-dollar money string, e.g. "$1,200". Pair with "about" in a sentence. */
export function usd(amount: number): string {
  return usdFmt.format(Math.round(amount));
}

/**
 * Plain-English gloss for a PG&E rate code, shown beside the raw code so the farmer
 * never sees a bare tariff. Empty string for an unknown code (caller renders the code
 * alone). Rate optimization is the wedge, so the rate is promoted to a first-class fact.
 */
export function rateGloss(code: string | null | undefined): string {
  if (!code) return "";
  const c = code.trim().toUpperCase();
  if (c.startsWith("AG-A")) return "Ag, energy only, no demand charge";
  if (c.startsWith("AG-B")) return "Ag with a demand charge";
  if (c.startsWith("AG-C")) return "Ag, time-of-use with a peak demand charge";
  if (c.startsWith("AG-4")) return "Legacy ag rate, closed to new meters";
  if (c.startsWith("AG-5")) return "Legacy ag time-of-use, closed to new meters";
  if (c.startsWith("NEM")) return "Net metering, solar";
  if (c === "B-1" || c.startsWith("B-")) return "Small commercial, not a pump";
  return "";
}

/** Compact whole-number with thousands separators, e.g. "29,512". Tabular figures. */
export function num(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Energy in kWh, abbreviated to MWh above 10,000 so fleet totals stay readable. */
export function kwh(value: number): string {
  if (value >= 100_000) return `${(value / 1000).toLocaleString("en-US", { maximumFractionDigits: 0 })} MWh`;
  return `${num(value)} kWh`;
}

/** Water volume: gallons, abbreviated to acre-feet above a million so it reads to a grower. */
export function gallons(value: number): string {
  if (value >= 1_000_000) {
    const af = value / 325_851; // 1 acre-foot = 325,851 gal
    return `${af.toLocaleString("en-US", { maximumFractionDigits: af >= 100 ? 0 : 1 })} acre-ft`;
  }
  return `${num(value)} gal`;
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Join names plainly: "East", "East and West", "East, West and South". */
function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export const en = {
  app: {
    name: "Terra",
  },
  // Sign-in (Epic 5, Story 5.1). No passwords: Google SSO or an emailed 6-digit code.
  // Plain operator English; no em dashes, no exclamation marks, never salesy.
  auth: {
    heading: "Sign in to Terra",
    subhead: "Your farm, every meter and bill in one place.",
    google: "Continue with Google",
    or: "or",
    emailLabel: "Email address",
    emailPlaceholder: "you@farm.com",
    sendLink: "Send a sign-in link",
    linkSent: "Check your email for a sign-in link.",
    sendCode: "Email me a code",
    error: "That did not work. Try again, or send a new code.",
    // Shown when a valid sign-in is refused because the email is not on the access list yet
    // (pre-launch gate). Calm and non-blaming: it is access, not a mistake they made.
    accessDenied: "This email is not set up for access yet. Reach out to the Terra team to get added.",
    signOut: "Sign out",
    tourPrompt: "Just want to look around first?",
    // The code-entry step: after we email a 6-digit code, the operator types it back here.
    // A typed code is more reliable on a phone than a tapped link (it works in the same tab
    // and is not consumed by email link-scanners). Plain operator English.
    code: {
      heading: "Check your email",
      sentTo: (email: string) =>
        `We sent a 6-digit code to ${email}. Enter it below. It expires in 10 minutes.`,
      label: "6-digit code",
      placeholder: "000000",
      verify: "Verify and sign in",
      resend: "Send a new code",
      differentEmail: "Use a different email",
      // Shown when the verify budget is spent (5 wrong tries): the code is cleared for safety
      // and they need a fresh one. Lands on the email step.
      tooManyAttempts: "Too many tries. For your safety we cleared that code. Enter your email to get a new one.",
      // Shown when too many codes were requested for one email in a short window.
      tooManyRequests: "You have asked for several codes. Use the most recent one, or wait a few minutes.",
    },
    // The code email itself (real sender). The code is rendered large in the body.
    email: {
      subject: "Your Terra sign-in code",
      heading: "Your sign-in code",
      body: "Enter this code to sign in to Terra. It works once and expires in 10 minutes.",
      ignore: "If you did not ask to sign in, you can ignore this email.",
    },
  },
  // Connect-a-source onboarding (Epic 5, Story 5.2). Operator-operable: identify the farm,
  // connect at least one source, confirm, land in the dashboard. Plain operator English;
  // no em dashes, no exclamation marks; the grower's words (meters, bills, farm).
  connect: {
    identify: {
      eyebrow: "Set up the farm",
      title: "Whose farm is this?",
      intro: "Start with the farm name and who runs it. You can change these later.",
      farmNameLabel: "Farm name",
      farmNamePlaceholder: "Batth Farms",
      ownerLabel: "Owner or main contact",
      ownerPlaceholder: "Full name",
      emailLabel: "Email (optional)",
      emailPlaceholder: "owner@farm.com",
      continue: "Continue",
    },
    picker: {
      eyebrow: "Connect a source",
      stepLabel: "Step 2 of 3",
      title: "Connect the farm's power data",
      intro:
        "Pick one. Connecting PG&E brings in every meter, rate, and bill at once. No PG&E login handy? Upload a bill or a meter list instead.",
      pgeTitle: "Connect PG&E",
      pgeBody:
        "Sign in to PG&E once and Terra pulls every meter, rate, and bill on the account.",
      pgeCta: "Connect PG&E",
      pgeStarting: "Opening PG&E sign in...",
      pgeRecommended: "Fastest",
      pgeSecure:
        "Your login goes straight to PG&E through our secure utility connection. Terra never sees your password.",
      billsTitle: "Upload a bill",
      billsBody:
        "We read the account, rate, and billing cycle right off it. You never type what is printed on the bill.",
      billsCta: "Choose a bill",
      billsHint: "A clear photo or PDF of a recent PG&E bill.",
      greenButtonTitle: "Upload a PG&E data export",
      greenButtonBody:
        "Already downloaded your usage from PG&E? Drop the Green Button file here. One export can carry every account.",
      greenButtonCta: "Choose export files",
      greenButtonHint: "PG&E Green Button files, saved as XML. Add several if you have them.",
      sheetTitle: "Upload a meter list",
      sheetBody:
        "Have a master spreadsheet of meters? Add it to fill in the inventory. It needs a bill or PG&E to show costs.",
      sheetCta: "Choose a CSV",
      sheetHint: "A spreadsheet of your meters, saved as CSV.",
      moreWays: "More ways to connect",
      chosen: (name: string) => `Selected: ${name}`,
      uploading: "Reading your file...",
      sampleCta: "Just exploring? Load sample data",
      statusNone: "No data yet. Connect a source to continue.",
      statusInventory: (n: number) =>
        `${n} ${n === 1 ? "meter" : "meters"} on the list. Connect PG&E or a bill to see costs.`,
      statusReady: (n: number) => `${n} ${n === 1 ? "meter" : "meters"} connected.`,
      addMore: "You can add more accounts before you continue.",
      continue: "Continue to review",
      differentFarm: "Not this farm? Start a different one",
      error: "That did not work. Try again.",
    },
    // The connecting screen: the grower has opened PG&E's hosted sign-in in another tab; we
    // poll until their accounts, meters, and bills land, then move on to review.
    connecting: {
      eyebrow: "Connecting to PG&E",
      title: "Finishing your PG&E connection",
      waiting:
        "Sign in to PG&E in the tab we just opened and choose the accounts to share. Keep this tab open. We will pull your meters and bills the moment you finish.",
      working: "Pulling your meters and bills from PG&E. This can take a minute.",
      accounts: (n: number) => `${n} ${n === 1 ? "account" : "accounts"}`,
      meters: (n: number) => `${n} ${n === 1 ? "meter" : "meters"}`,
      ready: "Your data is in. Taking you to review.",
      continueReady: "Continue with what is ready",
      reopen: "Reopen the PG&E sign in",
      trouble: "Having trouble? Go back and try another way",
      finishing: "Bringing in your meters...",
    },
  },
  // "Tour a sample" (Epic 5, Story 5.3): the public, badged representative dashboard a
  // prospect or investor can see with zero commitment. Plain operator English.
  tour: {
    link: "Tour demo",
    connectCta: "Connect your farm",
    connectNote: "This is representative data. Connect your own farm to see your numbers.",
  },
  // The Home landing (the farm known at a glance). Distinct from the Energy tool: a calm
  // overview that opens into the agents, not the full meter dashboard. Plain operator
  // English; no kW/jargon, no em dashes, no exclamation marks.
  home: {
    eyebrow: "Your farm",
    metersSummary: (meters: number, accounts: number): string =>
      `${meters} ${meters === 1 ? "meter" : "meters"} across ${accounts} ${accounts === 1 ? "account" : "accounts"}`,
    // The top greeting strip (mockup style). The time-of-day word is picked in the component
    // from the farm's Pacific clock; the name is the owner's first name when we have one.
    greetingMorning: "Good morning",
    greetingAfternoon: "Good afternoon",
    greetingEvening: "Good evening",
    greetingSub: "Your meters at a glance.",
    // The lock toggle (top right) that turns drag-to-rearrange on/off, so a tile is never moved by
    // accident. Locked by default; the lock icon shows the state.
    editLayout: "Edit tabs",
    // The Home "parcels" tile: a non-interactive satellite preview of the operation's land that
    // links through to the full Parcels surface.
    parcelsPreview: {
      caption: "Your parcels",
      cta: "Open the parcels map",
    },
    // The summary card row across the top of Home (mirrors the mockup's stat cards).
    kpi: {
      meters: "Meters",
      metersAttention: (n: number): string =>
        n === 1 ? "1 needs attention" : `${n} need attention`,
      metersAllClear: "All clear",
      accounts: "PG&E accounts",
      accountsSub: "Across all meters",
      spend: "Latest monthly spend",
      spendNotLoaded: "No bills loaded yet",
      demand: "Demand charges",
      noDemand: "None this cycle",
      savings: "Savings found",
      savingsNone: "Nothing flagged yet",
    },
    stat: {
      meters: "Meters",
      attention: "Need attention",
      savings: "Savings found",
      allClear: "All clear",
    },
    // The spend area-chart hero (gradient chart + time-range pills + today marker).
    spendHero: {
      title: "PG&E spend",
      sub: "By month, reconciled meters",
      empty: "Not enough billing history yet",
      // Spend with savings carved out (apples-to-apples year-over-year is not available yet), so we
      // never show a big alarming cost-increase number on a save-you-money product.
      spent: "spent",
      foundToCut: (amount: string): string => `${amount} we found to cut`,
      ranges: { m3: "3M", m6: "6M", y1: "1Y", all: "All" },
    },
    // The money-found band: the top-level total across the whole operation, with the count so a
    // partial list reads as partial. Kept separate from the refund (forward savings, not money owed).
    savingsCard: {
      eyebrow: "Possible savings",
      across: "we estimate across your operation",
      count: (n: number): string => `${n} ${n === 1 ? "opportunity" : "opportunities"} found`,
      cta: "See what needs a look",
      zero: "We will flag savings here as we find them.",
    },
    // The bills surface: the top card of the landing. Time-sensitive money, real amounts from the
    // connected account (no OCR, no "confirm" hedge). Three states by urgency.
    bills: {
      eyebrow: "Bills due",
      // The dates list: the thing growers ask for first - WHEN each PG&E bill is due, and how much.
      upcomingHeading: "When your bills are due",
      overdueTag: "overdue",
      dueCount: (n: number): string => `${n} bills`,
      noDates: "No bill dates on file yet. Connect PG&E or add a bill to see them.",
      dueRow: (date: string, amount: string): string => `${date} - ${amount}`,
      dueThisWeek: (amount: string, n: number): string =>
        `${amount} due across ${n} ${n === 1 ? "bill" : "bills"} this week`,
      overdue: (amount: string, n: number): string =>
        `${amount} overdue across ${n} ${n === 1 ? "bill" : "bills"}`,
      disconnectionRisk: "Disconnection risk. Pay now to avoid a shutoff.",
      soonest: (date: string): string => `Soonest due ${date}`,
      allCurrent: "All bills current",
      nextDue: (date: string, amount: string): string => `Next due ${date} (${amount})`,
      noneCurrent: "No upcoming bills on file.",
      cta: "Review bills",
    },
    // The retroactive-refund hook (PG&E Rule 17.1). A money CLAIM, so the estimate is conservative,
    // hard-rounded, "up to", and the verify label is unmissable - never a promise.
    refund: {
      eyebrow: "Possible refund owed",
      meters: (n: number): string =>
        `${n} ${n === 1 ? "meter looks" : "meters look"} mis-classified on a commercial rate.`,
      upTo: (amount: string): string => `You may be owed up to ${amount} back`,
      estimateLabel: "Estimated. We verify before you claim anything.",
      rule: "Commercial-rate pumps can reclaim up to 3 years under PG&E Rule 17.1.",
      cta: "See which meters",
    },
    // The bottom trust line: the meter count, demoted from a headline to a quiet reassurance.
    trustLine: (n: number): string => `We checked all ${n} of your meters.`,
    // Type tags on each "what needs a look" row, keyed by the finding's engine tool.
    tags: {
      "rate-optimization": "Rate fix",
      "demand-charge": "Spike",
      "bill-audit": "Bill check",
      solar: "Solar",
      refund: "Refund",
    } as Record<string, string>,
    // The Rate Fix hero card (the conversion moment). Leads with one named pump and one dollar;
    // the resolved state reuses the finding's result note (the trust loop, same card over time).
    rateFix: {
      eyebrow: "Rate fix",
      // The hero is explicitly the biggest single item within the total found.
      biggestEyebrow: "Biggest savings opportunity",
      // Lead with plain meaning; the rate codes are demoted to supporting detail on the card.
      plainLead: "You are on the wrong PG&E rate plan for how this pump actually runs.",
      // The number is an ESTIMATE of what switching this pump's rate could be worth, read from the
      // grower's own bills - never a promise. Say so plainly (it is tentative until confirmed).
      perYear: "a year if you switch",
      estimateNote: "An estimate from your own bills, not a promise. We check it with you before anything changes.",
      trace: "See how we got this",
      done: "Mark as done",
      notNow: "Not now",
      saving: "Saving",
      emptyTitle: "Every pump is on its best rate.",
      emptyBody: "Nothing to move.",
      whatHappenedLabel: "What happened",
    },
    // The farm profile card (mirrors the reference's profile card) and the two gradient stat tiles.
    profile: {
      title: "Farm",
      ownerRole: "Owner",
      meters: "Meters",
      accounts: "Accounts",
      // Labeled "Operations" (the legal operating entities). Not "Ranches": the ranch rollup is
      // empty in the data today, so "Ranches: 0" would mislead. Swap to "Ranches" once it is filled.
      entities: "Operations",
    },
    tiles: {
      reconciled: "Bills confirmed",
      reconciledSub: (loaded: number, total: number): string => `${loaded} of ${total} meters`,
    },
    // The "Spend by entity" progress-bar card (mirrors the reference's "Developed areas").
    byEntity: {
      title: "Spend by entity",
      empty: "No reconciled spend yet",
    },
    // The hero map + secondary panel and the bottom card row.
    spendTrendTitle: "Spend trend",
    spendTrendSub: "PG&E spend by month, reconciled meters",
    spendTrendEmpty: "Not enough billing history yet",
    findingsTitle: "What needs a look",
    findingsViewAll: "See all in Energy",
    findingsEmpty: "Nothing needs you right now. We will flag it here when it does.",
    solarTitle: "Solar and NEM",
    solarMeters: (n: number): string =>
      n === 1 ? "1 solar meter" : `${n} solar meters`,
    solarNameplate: (kw: string): string => `${kw} kW installed`,
    solarTrueUp: (month: string): string => `Next true-up in ${month}`,
    solarNone: "No solar on this farm yet",
    // Weather (Open-Meteo). Condition labels map the WMO weather codes to plain words.
    weather: {
      title: "Weather",
      now: "Now",
      unavailable: "Weather is unavailable right now",
      condition: (code: number): string => {
        if (code === 0) return "Clear";
        if (code === 1) return "Mostly clear";
        if (code === 2) return "Partly cloudy";
        if (code === 3) return "Overcast";
        if (code === 45 || code === 48) return "Fog";
        if (code >= 51 && code <= 57) return "Drizzle";
        if (code >= 61 && code <= 67) return "Rain";
        if (code >= 71 && code <= 77) return "Snow";
        if (code >= 80 && code <= 82) return "Showers";
        if (code >= 95) return "Thunderstorms";
        return "Mixed";
      },
    },
    agentsHeading: "Your agents",
    energyBlurb: "Rates, bills, demand charges, and solar across every meter.",
    energyOpen: "Open Energy",
    energyAttention: (n: number): string =>
      n === 0
        ? "Nothing needs you right now."
        : `${n} ${n === 1 ? "thing needs" : "things need"} a look.`,
    attentionHeading: "What needs a look",
    attentionEmpty: "Nothing needs you right now. We will flag it here when it does.",
    attentionViewAll: "See all in Energy",
  },
  // Parcels: the public-records parcel lookup (a top-level agent). Given a point, find the county
  // parcel that contains it (APN + boundary + acreage) from free county GIS sources. Plain operator
  // English; no em dashes; the grower's words (parcel, county, acres).
  parcel: {
    eyebrow: "Public records",
    title: "Parcel lookup",
    intro:
      "Enter a point and Terra finds the public county parcel that contains it: its APN, acreage, and boundary, straight from the county's own records.",
    latLabel: "Latitude",
    lngLabel: "Longitude",
    lookup: "Look up parcel",
    lookingUp: "Looking up...",
    emptyTitle: "Look up a parcel",
    emptyBody: "Enter a latitude and longitude, then look up the parcel that contains the point.",
    apnLabel: "APN",
    copyApn: "Copy",
    copied: "Copied",
    countyLabel: "County",
    acresLabel: "Acres",
    centroidLabel: "Centroid (lat, lng)",
    sourceLink: "View county parcel source",
    countyValue: (county: string): string => `${county} County`,
    acresValue: (acres: number): string =>
      `${acres.toLocaleString("en-US", { maximumFractionDigits: 2 })} acres`,
    centroidValue: (lat: number, lng: number): string => `${lat.toFixed(6)}, ${lng.toFixed(6)}`,
    metersAway: (m: number): string =>
      `${m.toLocaleString("en-US", { maximumFractionDigits: 1 })} m`,
    // Honest note when the point fell on a road / right-of-way and we returned the nearest parcel.
    nearestNote: (distance: string): string =>
      `This point sits on a road or right-of-way, so no parcel contains it. Showing the nearest parcel, about ${distance} away.`,
    // Error states keyed by the code /api/parcel returns.
    errors: {
      invalid_point: "Enter a latitude between -90 and 90 and a longitude between -180 and 180.",
      out_of_coverage:
        "Terra does not have a parcel source for this spot yet. Fresno County is live; more counties are coming.",
      not_found: "No county parcel found at this point.",
      upstream: "The county parcel service did not respond. Try again in a moment.",
      lookup_failed: "That lookup did not work. Check the numbers and try again.",
    },
    // The map-first farm OS: every block on the map, click for the grouped detail drawer, shade by
    // attribute, portfolio summary. Plain operator English; the grower's words (block, acres, crop).
    farm: {
      // Top banner over the map (representative data + connect CTA).
      banner: "Representative farm. Connect yours to see your own blocks.",
      connect: "Connect your farm",
      // The + Add parcel tool.
      addParcel: "Add parcel",
      addTitle: "Add a parcel",
      addHint: "Enter an APN or a coordinate. Terra pulls the boundary and fills in the rest.",
      addApnLabel: "APN",
      addApnPlaceholder: "e.g. 33803239S",
      addLatLabel: "Latitude",
      addLngLabel: "Longitude",
      addByApn: "Add by APN",
      addByCoord: "Add by coordinate",
      adding: "Pulling boundary...",
      addNote: "Connecting a real farm enters all your APNs at once and auto-enriches every block.",
      // Color-by + base map controls.
      colorBy: "Color by",
      baseMap: "Base map",
      satellite: "Satellite",
      streets: "Map",
      // Portfolio summary strip.
      summary: {
        acres: "Acres",
        blocks: "Blocks",
        leased: "Leased",
        expiring: "Leases expiring",
        attention: "Need a look",
        none: "All clear",
      },
      // Keyboard / screen-reader block list (the map canvas is pointer-only).
      blocksLabel: "Blocks",
      openBlock: (name: string, crop: string, acres: string): string => `Open ${name}, ${crop}, ${acres}`,
      // Detail drawer.
      attention: "Needs a look",
      copyApn: "Copy",
      copied: "Copied",
      close: "Close",
      notOnFile: "Not on file",
      sourceFrom: (source: string): string => `from ${source}`,
      // Marks a representative/sample value (no real public source) so it is never mistaken for fact.
      sampleTag: "sample",
      sampleDisclaimer:
        "Fields marked sample are representative data until you connect your records. Sourced fields show where the public data came from.",
      sections: {
        identity: "Identity & lease",
        planting: "Planting",
        water: "Water",
        energy: "Energy",
        soil: "Soil",
        health: "Health & monitoring",
        compliance: "Spray & compliance",
        financial: "Financial",
      },
      labels: {
        grossAcres: "Gross acres",
        netPlanted: "Net planted",
        mtrs: "Section (MTRS)",
        tenure: "Tenure",
        landlord: "Landlord",
        rentPerAcre: "Rent / acre",
        leaseTerm: "Lease term",
        crop: "Crop",
        variety: "Variety",
        rootstock: "Rootstock",
        plantingYear: "Planted",
        treeCount: "Trees / vines",
        spacing: "Spacing",
        irrigation: "Irrigation",
        expectedYield: "Expected yield",
        historicalYield: "Last season's yield",
        waterSource: "Source",
        wellDepth: "Well depth",
        wellHp: "Well HP",
        wellCapacity: "Well capacity",
        gsa: "Groundwater agency",
        allocation: "GW allocation",
        waterDistrict: "Water district",
        et: "Seasonal ET",
        pgeMeter: "PG&E meter",
        rateSchedule: "Rate schedule",
        pumpHp: "Pump HP",
        annualEnergyCost: "Energy cost / yr",
        soilClass: "Soil",
        slope: "Slope",
        salinity: "Salinity",
        ndvi: "NDVI",
        ndviTrend: "Trend",
        scouting: "Scouting notes",
        photos: "Field photos",
        permit: "Permit site",
        sprayHistory: "Spray history",
        tasks: "Upcoming tasks",
        revenue: "Revenue",
        costPerAcre: "Cost / acre",
        leaseCost: "Lease cost",
      },
      tenure: { owned: "Owned", leased: "Leased" },
      irrigation: {
        drip: "Drip",
        micro_sprinkler: "Micro-sprinkler",
        fanjet: "Fanjet",
        flood: "Flood",
        furrow: "Furrow",
        solid_set: "Solid set",
      } as Record<string, string>,
      waterSource: {
        well: "Well",
        district: "District water",
        well_and_district: "Well + district",
        riparian: "Riparian",
      } as Record<string, string>,
      ndviTrend: { improving: "Improving", stable: "Stable", declining: "Declining" } as Record<string, string>,
      rateMisclassified: "Looks misclassified",
      reiActive: "REI active",
      phiActive: "PHI active",
      overdue: "Overdue",
      acres: (n: number): string => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} ac`,
      perAcre: (n: number, unit: string): string => `${num(n)} ${unit}/ac`,
      af: (n: number): string => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })} ac-ft`,
      afPerAcre: (n: number): string => `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ac-ft/ac`,
      feet: (n: number): string => `${num(n)} ft`,
      hp: (n: number): string => `${num(n)} hp`,
      gpm: (n: number): string => `${num(n)} gpm`,
      pct: (n: number): string => `${n.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`,
      // A spray record line; rei/phi badges are added by the component when still active.
      sprayLine: (material: string, date: string): string => `${material} - ${date}`,
      // The real DPR PUR section-level summary (1-sq-mi PLSS section, not the exact field).
      spraySection: {
        title: (year: number): string => `Pesticides in this section (${year})`,
        summary: (records: number, lbs: number): string =>
          `${records} reported applications, about ${lbs.toLocaleString("en-US")} lb of active ingredient.`,
        note: "Reported to CA DPR by 1-square-mile section, not this exact field.",
      },
    },
  },
  // The account / profile page (signed-in operator's own details + connected sources).
  // The post-login fork (the /start screen): a signed-in user with no farm chooses to create a
  // new farm or join one a teammate already set up. Plain operator English. No em dashes, no
  // exclamation marks.
  start: {
    eyebrow: "Welcome to Terra",
    title: "Get started",
    lede: "Are you setting up a new farm, or joining one a teammate already made?",
    create: {
      title: "Create a farm",
      body: "Connect your PG&E account and see all your meters, rates, and bills in one place.",
      cta: "Create a farm",
    },
    // Join a farm someone else set up: enter the code they gave you and ask to join (the /join page).
    join: {
      title: "Join a farm",
      body: "Enter the join code a teammate gave you. They approve you before you see the farm.",
      cta: "Join a farm",
    },
    // Escape hatch back to the sign-in page (signs the current session out on the way).
    backToLogin: "Back to login",
  },
  // Request-to-join (Phase 2), requester-facing: the /join code-entry page, the waiting screen, the
  // declined notice, and the email to admins. Plain operator English. No em dashes, no exclamations.
  join: {
    title: "Join a farm",
    lede: "Enter the join code your team gave you. An admin approves you before you see anything.",
    codeLabel: "Join code",
    codePlaceholder: "Example: 7K2P9QXM",
    messageLabel: "Add a note (optional)",
    messagePlaceholder: "Tell them who you are.",
    submit: "Ask to join",
    back: "Back",
    // Outcomes returned by the ops, shown to the requester.
    outcome: {
      submitted: "Your request is in. We will let you know when an admin approves it.",
      alreadyRequested: "Your request is already in. We will let you know when an admin approves it.",
      alreadyMember: "You already have access to this farm.",
      invitePending: "You have already been invited to this farm. Sign out and back in to open it.",
      codeNotFound: "That code did not match a farm. Check it with whoever shared it.",
      denyCooldown: "This farm reviewed your request recently. You can ask again later.",
      rateLimited: "Too many requests just now. Try again in a little while.",
      requestGone: "That request is no longer open.",
    },
    // The waiting-for-approval screen (rendered by /start while a request is pending).
    waiting: {
      title: "Waiting for approval",
      body: (farmName: string): string =>
        `Your request to join ${farmName} is waiting for an admin to approve it.`,
      hint: "You can close this and come back. We will let you in as soon as they approve.",
      cancel: "Cancel request",
      signOut: "Use a different account",
    },
    // Shown on the fork after a request was declined.
    declined: {
      title: "Your request was not approved",
      body: (farmName: string): string =>
        `Your request to join ${farmName} was declined. You can ask again later or create your own farm.`,
    },
    // The email to admins when someone asks to join.
    requestEmail: {
      subject: (farmName: string): string => `Someone asked to join ${farmName} on Terra`,
      heading: (farmName: string): string => `A request to join ${farmName}`,
      body: (requesterName: string, farmName: string): string =>
        `${requesterName} asked to join ${farmName}. Open the team page to approve or decline. They only get access once you approve.`,
      button: "Review the request",
      ignore: "If you do not know this person, you can decline the request.",
    },
  },
  account: {
    navLabel: "Account",
    eyebrow: "Account",
    title: "Your account",
    signedInAs: "Signed in as",
    nameLabel: "Name",
    emailLabel: "Email",
    noName: "Not set",
    farmHeading: "Farm",
    farmLabel: "Farm name",
    sourcesHeading: "Connected sources",
    sourcesEmpty: "No sources connected yet.",
    sourceStatus: (type: string, status: string): string => `${type} - ${status}`,
    connectMore: "Connect another account",
    // Shown to a viewer in place of the connect button (connecting data is an admin action).
    connectMoreHint: "Ask an admin to connect another account.",
    // Whole-new-farm entry (distinct from connecting more sources to THIS farm).
    addFarm: "Start or join another farm",
    signOut: "Sign out",
    // Almond usage meter (like the usage panel in Claude's account). Per-user, resets on a rolling
    // window. Research-backed for low-software-literacy growers: a concrete "messages left" COUNT plus
    // a bar reads far better than a percentage or raw token counts. The count is approximate (the real
    // limit is token-based); "About" makes that honest. Plain operator English, no jargon, no
    // exclamation marks, no em dashes.
    usage: {
      heading: "Almond usage",
      // Concrete count above the bar. `period` is "today" or "this week".
      remaining: (left: number, total: number, period: string): string =>
        `About ${left} of ${total} messages left ${period}`,
      periodDaily: "today",
      periodWeekly: "this week",
      // Reset line under the bar.
      resetsDaily: "Resets tomorrow",
      resetsWeekly: "Resets next week",
      // Shown in place of the count once the budget is spent.
      limitReachedDaily: "You have used all of today's messages. More tomorrow.",
      limitReachedWeekly: "You have used all of this week's messages. More next week.",
      // Reassurance line so a grower is not alarmed by the meter.
      hint: "Almond is included with your plan. The limit keeps usage fair across your team.",
    },
  },
  // Team management (the multi-user farm membership feature). Plain operator English; the trust
  // promise ("only this farm") is stated plainly. No em dashes, no exclamation marks.
  team: {
    navLabel: "Team",
    eyebrow: "Team",
    title: "Who can see this farm",
    lede: (farmName: string): string =>
      `Everyone here can open ${farmName}. They cannot see any other farm.`,
    // Roles and what each can do (shown in the role picker and on each member row).
    roles: {
      owner: {
        label: "Owner",
        desc: "Runs the farm. Can add or remove people, connect data, and change anything.",
      },
      manager: {
        label: "Manager",
        desc: "Can see everything, use the tools, and add or remove teammates. Cannot remove the owner.",
      },
      viewer: { label: "View only", desc: "Can look but not change anything." },
    },
    // Add-people form.
    addHeading: "Add people by email",
    addPlaceholder: "manager@farm.com, irrigator@farm.com",
    addHelper: "Paste one email or several, separated by commas or new lines.",
    roleLabel: "What can they do",
    reviewCta: "Review invites",
    sendCta: "Send invites",
    back: "Back",
    // Confirm step (catches a typo before a real stranger is granted access).
    confirmTitle: "Send these invites",
    confirmBody: "Each person signs in with their own email and only sees this farm.",
    invalidEmail: (bad: string): string =>
      `That does not look like an email: ${bad}. Fix it or remove it.`,
    added: (n: number): string =>
      n === 1
        ? "Invite sent. They can sign in with this email to open the farm."
        : `${n} invites sent. Each person can sign in with their own email to open the farm.`,
    alreadyOnTeam: "Some of those are already on the team. We left them as they are.",
    sendError: "We saved the invites but could not email everyone. They can still sign in to join.",
    // Member list.
    membersHeading: "People with access",
    invitesHeading: "Invited, not signed in yet",
    you: "You",
    statusActive: "Active",
    statusInvited: "Invited, not signed in yet",
    addedBy: (name: string): string => `Added by ${name}`,
    // Row controls.
    resend: "Resend invite",
    cancelInvite: "Cancel invite",
    changeRole: "Change role",
    remove: "Remove from farm",
    leave: "Leave this farm",
    transfer: "Make owner",
    removeConfirm: (name: string): string =>
      `Remove ${name}? They will lose access to this farm right away. You can invite them back any time.`,
    leaveConfirm: "Leave this farm? You will lose access right away.",
    // Guard messages.
    lastOwner: "Every farm needs an owner. Make someone else the owner first.",
    managerLimited: "Only the owner can do that.",
    cannotActOnOwner: "Only the owner can change the owner.",
    // Account hub summary card.
    summaryCard: (n: number): string =>
      n === 1 ? "1 person has access" : `${n} people have access`,
    manageLink: "Manage team",
    // Viewer version of the account-hub CTA (a viewer reaches a read-only member list).
    viewLink: "See who has access",
    // Farm switcher (for a user who can open more than one farm).
    switcherHeading: "Farms you can open",
    // "+ Add a farm" entry in the switcher (start or join another farm).
    addFarm: "Add a farm",
    // Request-to-join (Phase 2): the admin-facing approval surface + the shareable join-code card.
    requestsHeading: "Asked to join",
    // Accessible label for the Team nav badge (a bare number is not meaningful to a screen reader).
    pendingBadge: (n: number): string =>
      n === 1 ? "1 request to join waiting" : `${n} requests to join waiting`,
    requestApprove: "Approve",
    requestDeny: "Decline",
    requestRoleLabel: "Let them",
    requestApproved: "Added to the farm.",
    requestDenied: "Request declined.",
    requestNote: (note: string): string => `Note: ${note}`,
    joinCode: {
      heading: "Invite by link",
      body: "Share this code or link with someone so they can ask to join. You approve each request.",
      codeLabel: "Join code",
      copyLink: "Copy link",
      copied: "Copied",
      rotate: "Make a new code",
      show: "Show join code",
    },
    // Empty state.
    empty: {
      title: "It is just you so far",
      body: "Add your managers and crew by email so they can open this farm with you. Each person signs in with their own email and only sees this farm.",
    },
    // The invite email itself (real sender via Resend). Plain operator English.
    inviteEmail: {
      subject: (farmName: string): string => `You have been added to ${farmName} on Terra`,
      heading: (farmName: string): string => `Open ${farmName} on Terra`,
      body: (inviter: string, farmName: string): string =>
        `${inviter} added you to ${farmName}. Sign in with this email to see the farm's meters, bills, and savings. You will only see this one farm.`,
      button: "Open the farm",
      ignore: "If you were not expecting this, you can ignore this email.",
    },
  },
  // The Reports area (Story 8.7): a place in the grower's account that lists every spreadsheet
  // Almond has made them, newest first, each re-downloadable through the owner-scoped route. Plain
  // operator English, the grower's words. No kW/interval jargon, no em dashes, no exclamation marks.
  reports: {
    // Left-rail / nav label and the page chrome.
    navLabel: "Reports",
    eyebrow: "Reports",
    title: "Reports Almond made",
    // One-line lede under the title, stating what this area is.
    lede: "Every spreadsheet Almond has made you, newest first. Open any one to download it again.",
    // Per-row labels. The kind label itself comes from the export skill's plain-name map.
    madeOnLabel: "Made",
    requestLabel: "You asked",
    // Download control on each row (the owner-scoped re-download).
    download: "Download",
    downloadAria: (title: string): string => `Download ${title}`,
    // Calm empty state, in Almond's voice, inviting the first artifact. No exclamation, no em dash.
    empty: {
      title: "No reports yet",
      body: "Ask Almond for a spreadsheet of your meters or your bill due dates. Whatever it makes you will be kept here so you can download it again any time.",
    },
  },
  // The To-do area: findings the grower parked from the Energy findings rail. Each card can be
  // marked done or removed. Plain operator English, the grower's words. No jargon, no em dashes,
  // no exclamation marks.
  todos: {
    // Left-rail / mobile-tab nav label and the page chrome.
    navLabel: "To-do",
    eyebrow: "To-do",
    title: "Your to-do list",
    lede: "Findings you parked to act on later. Mark one done when you have handled it, or remove it.",
    // Calm empty state, pointing back at where to-dos come from.
    empty: {
      title: "Nothing on your list",
      body: 'When a finding looks worth acting on, tap "Add to to-do" on it and it lands here.',
    },
    // Per-card actions on the To-do page.
    markDone: "Mark done",
    remove: "Remove",
    saving: "Saving",
    error: "That did not save. Try it again.",
  },
  // The Agents audit area (the agentic foundation). The page lists what Terra's agents have
  // done for this farm, newest first, and lets the farm owner approve or reject anything an
  // agent proposed before it acts. Plain operator English, the grower's words. No utility
  // jargon, no em dashes, no exclamation marks.
  //
  // FROZEN SHARED BLOCK plus four PRE-STUBBED nested blocks (billDispute / rateAgent /
  // solarWatch / incentives): a feature worktree FILLS its own nested block rather than
  // appending at this shared boundary, so the four agents never collide on this file.
  agents: {
    // Left-rail / mobile-tab nav label and the page chrome.
    navLabel: "Agents",
    eyebrow: "Agents",
    title: "What your agents did",
    lede: "Terra's agents keep your farm current and flag the moves worth making. Anything that would act on your behalf waits here for your okay.",
    // Back-to-home link (mirrors the Reports area).
    home: "Home",
    // A single run header line: which agent, when it ran.
    runOnLabel: "Ran",
    // Run-status labels (mirror the AgentRunStatus union; color is never the only signal).
    runStatus: {
      running: "Running",
      succeeded: "Up to date",
      failed: "Could not finish",
    },
    // Action-status labels (mirror the AgentActionStatus union).
    actionStatus: {
      proposed: "Waiting for your okay",
      approved: "Approved",
      rejected: "Skipped",
      executed: "Done",
      failed: "Could not finish",
    },
    // One-tap controls on a proposed action (owner only).
    approve: "Approve",
    reject: "Skip",
    approveAria: (summary: string): string => `Approve: ${summary}`,
    rejectAria: (summary: string): string => `Skip: ${summary}`,
    // Calm error if an approve/reject did not save (mirrors resolveFinding's tone).
    actionError: "That did not save. Try it again.",
    // Read-only note for a non-owner viewing the audit (they cannot approve).
    readOnlyNote: "Only the farm owner can approve these.",
    // Empty state for a farm with no agent runs yet.
    empty: {
      title: "Nothing yet",
      body: "Once your PG&E connection is live, Terra's agents start working in the background. What they do shows up here.",
    },
    // The built-in refresh agent (daily re-pull plus re-run of the engines).
    refresh: {
      label: "Daily refresh",
      // Shown on a failed refresh when there is no specific error message (e.g. the PG&E
      // sign-in needs to be renewed). The DB stores the real reason when there is one.
      failedNote: "We could not refresh from PG&E. The connection may need a fresh sign-in.",
      // Short note explaining the refresh agent on the audit page.
      note: "Terra re-checks your PG&E data every day and updates your findings.",
    },
    // --- PRE-STUBBED feature blocks: each feature worktree FILLS its own block here. ---
    // Rate switch agent (daily, recommend-only). It surfaces wrong-rate findings the
    // engines already proved and offers a one-tap "request this switch" the founder sees
    // in this audit list. Nothing auto-switches; no email yet. Plain operator English, no
    // em dashes.
    rateAgent: {
      label: "Rate check",
      // Summary line on the proposed action (the audit row). Reuses the grounded
      // current/target rate codes; the dollar figure is the engine's annual estimate.
      summary: (pump: string, from: string, to: string, savings: string): string =>
        `${pump} is on ${from}. Moving it to ${to} saves about ${savings} a year.`,
      // The one-tap control on a proposed rate-switch action (owner only).
      request: "Request this rate switch",
      requestAria: (summary: string): string => `Request this rate switch: ${summary}`,
      // Confirmation shown after the request is recorded. It is logged for the Terra team
      // to file with PG&E; nothing switches on its own.
      requested:
        "Requested. The Terra team files this rate change with PG&E. Nothing switches on its own.",
      // Calm error if the request did not save (mirrors the shared agents tone).
      requestError: "That did not save. Try it again.",
    },
    // Solar watch agent: a monthly, low-stakes finding that an array looks like it is slowly
    // putting out less than it used to. HONEST: the signal is a net-export proxy from your NEM
    // statements, not metered panel output, so the copy says "worth a look", never a dollar
    // claim. No em dashes; plain operator English.
    solarWatch: {
      label: "Solar watch",
      // The finding the grower sees. `pumpName` is the solar-paired meter; `monthsCounted` is
      // how many statement months backed the read; `worstPercent` is the biggest single
      // same-month-last-year drop (a whole number, already a proxy).
      situation: (pumpName: string): string =>
        `${pumpName} looks like it is putting out less than it did this time last year.`,
      // States plainly that this is a net-export proxy, not metered panel output, and that it
      // is a slow seasonal read, not a same-day fault.
      note: (worstPercent: number, monthsCounted: number): string =>
        `Compared month for month against last year, your net export is down about ${worstPercent}% at the worst point, across ${monthsCounted} months of PG&E solar statements. This is read from your net export, not from the panels directly, so it is a slow seasonal sign and not a same-day fault. Worth having someone look at the array.`,
      // The action is a look, not an automated step. Stays a finding (no approval gate).
      action: "Have the array checked",
      // Short note explaining the solar-watch agent on the audit page.
      audit:
        "Each month Terra compares your solar export against the same months last year and flags an array that looks like it is slowly putting out less. This is a net export proxy, not metered panel output.",
    },
    // Rebate / incentives agent (monthly, NO LLM, NO dollar). Honest-blank program
    // leads matched from a static catalog of real CA ag programs. The copy names the
    // program and what it is for, and is explicit that the dollar is not yet known: a
    // real saving needs interval data, which this agent does not have. No em dashes.
    incentives: {
      label: "Rebate finder",
      // Shown on a failed run when there is no specific error message.
      failedNote: "We could not check rebate programs this time. Terra will try again.",
      // Short note explaining the agent on the audit page.
      note: "Terra checks your meters against California ag rebate and incentive programs once a month and flags the ones you may qualify for.",
      // The finding's situation line: which meter, which program.
      situation: (pump: string, program: string): string =>
        `${pump} may qualify for ${program}.`,
      // The honest-blank impact note: names the program, no dollar. The grower confirms
      // eligibility and the amount with the program directly.
      programNote: (program: string): string =>
        `This meter fits the ${program} eligibility on the facts Terra has. We have not put a dollar on it yet, since that needs interval data we do not have. Check the program details to confirm and apply.`,
      action: (): string => "See this program",
    },
    // Bill dispute agent: watches the "act"-severity bill-audit findings, drafts a plain
    // PG&E dispute letter, waits for one-tap OWNER approval, and on approval renders an
    // immutable PDF dispute packet. v1 NEVER files with PG&E. Plain operator English, the
    // grower's words; no em dashes, no exclamation marks.
    billDispute: {
      // The agent's label in the audit UI / logs.
      label: "Bill dispute",
      // The Home card chrome shown beside a flagged bill-audit finding.
      card: {
        eyebrow: "Bill dispute",
        // The card heading names the meter and the cycle month.
        heading: (pump: string, month: string): string => `Dispute ${pump}'s ${month} bill`,
        // One calm sentence: what the agent drafted and that it is waiting for the owner.
        proposedBody: (excessUsd: number): string =>
          `Terra drafted a letter to PG&E about the roughly ${usd(excessUsd)} this bill ran over a usual month. Review it and approve to prepare a dispute packet you can file.`,
        // The one-tap owner control that approves and renders the packet.
        approve: "Approve and prepare dispute packet",
        approveAria: (pump: string, month: string): string =>
          `Approve and prepare the dispute packet for ${pump}'s ${month} bill`,
        // The decline control (rejects the proposal, nothing is filed).
        reject: "Not now",
        rejectAria: (pump: string, month: string): string =>
          `Skip the dispute for ${pump}'s ${month} bill`,
        // After approval: the packet is ready to download, then file by hand.
        readyHeading: "Dispute packet ready",
        readyBody:
          "Your dispute packet is saved to Reports. Download it, then send it to PG&E to open the dispute. Terra never files for you.",
        download: "Download the packet",
        // After the owner skips it.
        skipped: "Skipped. No dispute was prepared.",
        // Read-only note on the public Tour (a visitor cannot approve a real dispute).
        readOnlyNote: "This is a sample. Approving a dispute is available on your own farm.",
        // Calm error if the approve did not save (mirrors resolveFinding's tone).
        error: "That did not save. Try it again.",
      },
      // The one-line audit summary recorded with the proposed action.
      actionSummary: (pump: string, month: string, excessUsd: number): string =>
        `Draft a PG&E dispute for ${pump}'s ${month} bill, about ${usd(excessUsd)} over a usual month.`,
      // The deterministic /copy dispute LETTER. This is the LOAD-BEARING path: the packet
      // must be filable from this alone (the LLM is optional polish that may only reword,
      // never re-number). Every figure is passed in from the engine-authored action.params.
      letter: {
        subject: (pump: string, month: string): string =>
          `Billing dispute, ${pump}, ${month} statement`,
        // A plain block letter. Lines are joined with newlines by the drafter. No em dashes.
        body: (input: {
          pump: string;
          month: string;
          cycleRange: string;
          totalBillUsd: number;
          medianTotalUsd: number;
          excessUsd: number;
        }): string =>
          [
            "To the PG&E Billing Department,",
            "",
            `I am writing to dispute a charge on the statement for my agricultural meter ${input.pump}, for the service period ${input.cycleRange}.`,
            "",
            `This statement totaled about ${usd(input.totalBillUsd)}. For a comparable ${input.month} cycle this meter usually runs about ${usd(input.medianTotalUsd)}, so this bill is roughly ${usd(input.excessUsd)} higher than usual. The metered usage on this cycle did not rise to match the higher charge, which is why I believe the bill is overstated.`,
            "",
            "Please review this statement and the meter's usage for the period. If the charge is not supported by the metered usage, I am requesting a corrected bill and a credit for the difference.",
            "",
            "Thank you for looking into this.",
            "",
            "Sincerely,",
            "The account holder",
          ].join("\n"),
      },
      // The PDF dispute packet (the immutable Report rendered on approval).
      packet: {
        // The download file's title basis and the Report row title.
        title: (pump: string, month: string): string => `Bill dispute, ${pump}, ${month}`,
        // The packet header chrome.
        eyebrow: "PG&E bill dispute",
        heading: (pump: string): string => `Dispute packet for ${pump}`,
        // A labeled facts block on the packet (every value engine-authored).
        meterLabel: "Meter",
        periodLabel: "Service period",
        billedLabel: "Statement total",
        usualLabel: "Usual comparable cycle",
        excessLabel: "Amount disputed",
        // The letter section heading on the packet.
        letterHeading: "Draft letter to PG&E",
        // The honest footer: Terra prepared this, the grower files it.
        footer:
          "Prepared by Terra from your own bills. Review the figures, then file this with PG&E. Terra does not file disputes for you.",
        // The request text recorded on the Report row (the Reports history line).
        requestText: (pump: string, month: string): string =>
          `Bill dispute packet for ${pump}, ${month} statement`,
      },
    },
  },
  // Shared dashboard UI primitives (Epic 2). Plain operator English; the badge
  // labels pair with color so color is never the only signal (the a11y floor).
  ui: {
    severity: {
      act: "Act",
      watch: "Watch",
      info: "Info",
    },
  },
  // The OS shell (Epic 2): agent rail, lens toggle, findings rail, dashboard chrome.
  // Plain operator English; the grower's words. No kW/jargon, no em dashes, no exclamation.
  // (Namespaced `shell` to sit beside the legacy pump-timing `dashboard` namespace below.)
  shell: {
    // Agent rail (lists agents, not features). Home == the Energy dashboard today.
    agentsLabel: "Agents",
    // Section label above the nav list (the reference groups its nav under headings).
    navTrack: "Track",
    // The rail is grouped into three sections (Palantir-style hierarchy), each with a small caps
    // heading: live operating surfaces, the intelligence layer, and account/organization.
    sections: {
      operations: "Operations",
      intelligence: "Intelligence",
      organization: "Organization",
    },
    agents: {
      home: "Home",
      dashboard: "Dashboard",
      energy: "Energy",
      almond: "Almond",
      assistant: "Assistant",
      todos: "To-do",
      solar: "Solar",
      meters: "Meters",
      parcels: "Parcels",
      water: "Water",
      agents: "Agents",
      settings: "Settings",
    },
    comingTag: "Coming",
    // Tag on the not-yet-shipped "Beta" rail group (Water, Solar, Agents): sold in the rail,
    // grayed out and non-interactive until each ships.
    betaTag: "Beta",
    // One-time welcome shown on Home to an invited member (someone added to a farm another operator
    // set up). The owner who created the farm never sees it. No em dashes, no exclamation marks.
    memberWelcome: {
      title: (farmName: string): string => `You have been added to ${farmName}`,
      body: "You can see this farm's meters, bills, and savings. You only see this one farm.",
      dismiss: "Got it",
    },
    // Lens toggle (one meter dataset, one lens at a time).
    lensLabel: "View",
    lens: {
      chart: "Chart",
      table: "Table",
      map: "Map",
      calendar: "Calendar",
    },
    // Honest placeholder shown for a lens whose view has not shipped yet.
    lensComing: "This view is on the way.",
    // The Calendar lens (Story 3.5): billing-cycle closes on a month grid.
    calendar: {
      heading: "Billing cycle closes",
      legendActual: "Billed close, from the bill",
      legendScheduled: "Scheduled read, may shift",
      // Shown while no meter carries its serial code (the real account today).
      noSerials:
        "Scheduled read dates appear once each meter's serial code from the bill is on file. The dates shown now are the closes from posted bills.",
      empty: "No cycle closes this month.",
      prevMonth: "Earlier month",
      nextMonth: "Later month",
      weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      dayAria: (date: string, count: number): string =>
        count === 0
          ? date
          : count === 1
            ? `${date}, 1 meter closes. Show it`
            : `${date}, ${count} meters close. Show them`,
      dayHeading: (day: number, monthName: string, year: number): string =>
        `${monthName} ${day}, ${year}`,
      kindActual: "Billed close",
      kindScheduled: "Scheduled, may shift",
      chipAria: (name: string, kind: "actual" | "scheduled"): string =>
        kind === "actual"
          ? `${name}, billed close. Open its detail`
          : `${name}, scheduled read, may shift. Open its detail`,
      // Billing-cycle surface (2026-06-17): the Home next-close line, the Calendar
      // KPI strip, and the open-cycle standing sheet. Plain dates, no kW, no dollars
      // here; "expected" and "as of" carry the forecast/lag honesty in words.
      cycle: {
        nextCloseLine: (ranch: string, date: string, others: number): string =>
          others <= 0
            ? `Next bill close: ${ranch}, ${date}.`
            : others === 1
              ? `Next bill close: ${ranch}, ${date}. 1 more closes this week.`
              : `Next bill close: ${ranch}, ${date}. ${others} more close this week.`,
        // The watch clause, appended only when a meter is running hot. Typography
        // and clay carry it; never red, never a dollar.
        hotClause: "One meter is pulling harder than usual this cycle.",
        unforecastable: (n: number): string =>
          n === 1 ? "plus 1 meter we cannot forecast yet" : `plus ${n} meters we cannot forecast yet`,
        emptyLine: (ranch: string, date: string): string =>
          `No bills close in the next 10 days. Next is ${ranch}, ${date}.`,
        none: "No upcoming closes on file yet.",
        cta: "Open the calendar",
        kpiClosingWeek: "Closing this week",
        kpiClosingMonth: "Closing this month",
        kpiHot: "Running hot",
        // Forecast/lag honesty, in words (style is never the only signal).
        expected: "expected",
        standingTitle: (meter: string, date: string): string => `${meter}, closes ${date}`,
        standingPeak: (date: string): string => `Highest pull so far this cycle was ${date}.`,
        asOf: (date: string): string => `as of ${date}`,
        asOfStale: (date: string): string => `as of ${date}, our last read for this meter`,
        steer: (date: string): string =>
          `This cycle's peak is not locked until it closes ${date}, so easing off before then still helps.`,
        noReads:
          "We do not have this cycle's reads yet. We will show where it stands once they land.",
        trace: "See how we got this",
        // The front-page billing-close surface: when each meter's PG&E billing closes (the date the
        // serial sets), soonest first. The thing a grower asks to see first.
        closesEyebrow: "When your billing closes",
        closesNextLabel: "Next billing close",
        closesMeters: (n: number): string =>
          `${n} ${n === 1 ? "meter closes" : "meters close"} this day`,
        closesRowMeters: (n: number): string => `${n} ${n === 1 ? "meter" : "meters"}`,
        closesCta: "See the full calendar",
        closesNone: "Add each meter's serial from the bill to see when its billing closes.",
      },
    },
    // Findings rail (Story 3.1): the calm secondary feed beside the data hero.
    findingsLabel: "Findings",
    findingsEmpty: "Nothing needs you right now.",
    // Mobile findings bottom sheet peeking summary: count plus the rough dollars at
    // stake when there are any ("3 findings · ~$34k up"). compactUsd arrives
    // pre-formatted ("$34k"); the segment is omitted when no finding carries a number.
    findingsSummary: (count: number, compactUsd?: string): string => {
      if (count === 0) return "Nothing needs you right now";
      const base = count === 1 ? "1 finding" : `${count} findings`;
      return compactUsd === undefined ? base : `${base} · ~${compactUsd} up`;
    },
    // Almond, the farm assistant (Epic 6): a launcher in the corner that opens a chat panel.
    // Plain operator English, no exclamation marks, no kW/jargon on the surface.
    almond: {
      // Launcher button (the corner affordance that opens the panel).
      launcherLabel: "Ask Almond",
      openLabel: "Open Almond",
      closeLabel: "Close Almond",
      // Rail entry (Story 10.2, UX-DR4): the clear, persistent way to find Almond in the OS-shell rail,
      // alongside the floating launcher. Opens the same panel. Plain operator words, no exclamation mark.
      railLabel: "Ask Almond",
      // Panel header.
      name: "Almond",
      tagline: "Your farm assistant",
      // Composer.
      placeholder: "Ask anything about your farm",
      send: "Send",
      // Full-page Almond tab (Notion-style): a calm greeting hero over a big composer. Plain
      // operator English, no exclamation mark.
      pageEyebrow: "Assistant",
      pageGreeting: "How can I help you today?",
      // Time-aware greeting on the full Almond page command center ("Good morning, Batth Farms").
      greetMorning: "Good morning",
      greetAfternoon: "Good afternoon",
      greetEvening: "Good evening",
      greetWithFarm: (part: string, farm: string): string => `${part}, ${farm}`,
      // The farm command-center stat cards on the Almond landing (Palantir-style KPI row). Each
      // figure is real (computed from the farm's own reconciled data), never fabricated.
      stats: {
        savings: "Savings opportunity",
        savingsHint: "Across open findings",
        metersAtRisk: "Meters at risk",
        metersAtRiskHint: "Flagged or unreviewed",
        lastMonthSpend: "Last month PG&E spend",
        lastMonthSpendHint: "Latest billed cycle",
        activeAlerts: "Active alerts",
        activeAlertsHint: "Need a decision",
        empty: "Not on file",
      },
      // Model picker (a grower can switch which model answers; one farmer loved this). Plain words.
      modelLabel: "Model",
      modelPickerAria: "Choose which model answers",
      // Auto mode (Perplexity-Auto for Almond): the picker's default, where Almond decides what to do
      // and which model fits. The decision shows as one quiet line under a reply. Plain operator
      // English, no em dashes, no exclamation marks, no kW/tariff/interval jargon.
      auto: {
        label: "Auto",
        pulledCached: "Pulled your saved file",
        buildingNew: "Building a new file",
        answeredDirect: "Answered from your farm data",
        navigated: "Moved you there",
        readingAttachment: "Reading your attachment",
      },
      // File attachments (read-only context: PDFs, Excel, CSV). Owner-only.
      attach: "Add a file",
      attachAria: "Attach a PDF, Excel, or CSV",
      removeAttachment: (name: string): string => `Remove ${name}`,
      attachmentsLabel: "Attached",
      // Shown by the offline stub (dev/demo) to acknowledge a file it cannot read; the live model
      // actually reads the attachment.
      attachmentAck: (names: string[]): string =>
        names.length === 1
          ? `I can see you attached ${names[0]}.`
          : `I can see you attached ${names.length} files.`,
      // The full page labels its starter chips "Suggested" (Notion-style); the panel uses
      // `startersLabel` ("Try asking"). Same starters, different surface.
      suggestedLabel: "Suggested",
      // States.
      greeting: (farmName: string): string =>
        `I can answer questions about ${farmName}. Ask me about a meter, your rates, or where the money is going.`,
      // Shown beside the spinning thinking ring before any answer arrives, and again while Almond is
      // still building a file. Plain and calm, not farm-flavored. No exclamation marks, no em dashes.
      thinking: "Thinking",
      streaming: "Almond is answering",
      working: "Working on that",
      error: "That did not work.",
      retry: "Try again",
      // Per-message controls (copy the text, edit and re-ask a question, regenerate an answer). Plain
      // operator words, no exclamation marks.
      copy: "Copy",
      copied: "Copied",
      copyAria: "Copy this message",
      editAction: "Edit",
      editAria: "Edit this question and ask again",
      editSave: "Update",
      editCancel: "Cancel",
      regenerate: "Try again",
      regenerateAria: "Ask Almond to answer again",
      // Collapsible disclosure that reveals the model's reasoning when it streamed any (best-effort).
      thoughtLabel: "Thought",
      // Per-farm generation throttle (Story 10.3, AR16): shown by both file skills when one farm has
      // built too many heavy artifacts (spreadsheet / PDF) in a short window. Calm, retryable, never a
      // hard error. Plain operator English, no exclamation mark.
      busy: "You have made several files in a row. Give it a minute and ask again.",
      // Durable per-user TOKEN budget (Story 10.4): shown when a grower has used up their Almond
      // allowance for the window. A hard stop until the window resets (unlike `busy`, which is a brief
      // throttle), so there is no retry button. Calm, plain operator English, no exclamation marks.
      usage: {
        // The limit-reached banner. `window` is the active reset cadence.
        limitReached: (window: "daily" | "weekly"): string =>
          window === "weekly"
            ? "You have reached your weekly limit for Almond. It resets in a few days."
            : "You have reached your daily limit for Almond. It resets tomorrow.",
        // The composer placeholder while locked out.
        composerDisabled: "Almond limit reached. Try again later.",
      },
      // Accessible label for the live conversation region.
      conversationLabel: "Conversation with Almond",
      // Saved history (per-user, per-farm): a new-chat affordance and the list of past threads.
      // Each grower sees only their OWN chats. Plain operator English, no exclamation marks.
      newChat: "New chat",
      newChatAria: "Start a new chat",
      history: "History",
      historyAria: "Your saved chats",
      // Labeled button on the Almond page that opens the saved-chats overlay (replaces the always-on rail).
      savedChats: "Saved chats",
      chatsHeading: "Chats",
      historyEmpty: "No saved chats yet",
      historyLoading: "Loading your chats",
      deleteChat: "Delete",
      deleteChatAria: (title: string): string => `Delete chat: ${title}`,
      closeHistory: "Close history",
      // Starter prompts shown on the empty chat, drawn from the farm so the grower is never staring
      // at a blank box. Two kinds (Story 10.1): READ questions (always safe) and ACTION/EXPORT prompts
      // that advertise Almond's new powers (Epics 7-9). The finding-pointing prompts
      // (`openBiggestOpportunity`, `misRatedPdf`) only show when the farm has a finding; the export
      // prompts (`exportMeters`, `misRatedPdf`) are owner-only because they drive the export/PDF skills
      // the public Tour cannot use. Selection lives in src/lib/almond/starters.ts.
      startersLabel: "Try asking",
      starters: {
        // Read questions (answered by the read tools; shown to every actor). `biggestOpportunity` is
        // the read phrasing; the empty-chat selection prefers the `openBiggestOpportunity` action when
        // there is a finding, but the read phrasing is kept for reuse.
        biggestOpportunity: "What is my biggest opportunity to save money?",
        costliestMeters: "Which meters cost me the most?",
        wrongRate: "Are any of my meters on the wrong rate?",
        dataCompleteness: "How complete is my billing data?",
        // Action prompt (drives the navigate skill; read-safe, shown to every actor).
        openBiggestOpportunity: "Open my biggest opportunity",
        // Export prompts (drive the owner-only export/PDF skills; never shown on the public Tour).
        exportMeters: "Export my meters as a spreadsheet",
        misRatedPdf: "Make a PDF of my mis-rated pumps",
      },
      // First-run nudge (Story 10.2, FR21 / FR22 / UX-DR5): a calm, dismissible, once-only hint that
      // points the grower at Almond on their first dashboard view, then is never seen again. Plain
      // operator English, no exclamation mark, no em dash. Shown only to a real owner on Home (gated
      // server-side); never on the public Tour. `dismiss` is the X button's accessible label.
      nudge: {
        title: "Meet Almond",
        body: "Ask Almond to show you your most expensive meter.",
        cta: "Show me",
        dismiss: "Dismiss",
      },
      // Compact chips shown when Almond consults the farm data to answer.
      lookedAt: {
        getFarmOverview: "Looked at your whole farm",
        listMeters: "Looked at your meters",
        getMeter: "Looked at a meter",
        listFindings: "Looked at your findings",
        getRatesSummary: "Looked at your rates",
        getReconciliation: "Looked at your billing data",
      },
      // One quiet line under the answer instead of a row of loud chips: a "Looked at" prefix plus the
      // short noun for each source, joined with a middot ("Looked at your whole farm · your findings").
      lookedAtPrefix: "Looked at",
      lookedAtShort: {
        getFarmOverview: "your whole farm",
        listMeters: "your meters",
        getMeter: "a meter",
        listFindings: "your findings",
        getRatesSummary: "your rates",
        getReconciliation: "your billing data",
      },
      // Action chips: a plain-English record of each navigation Almond drove, and a link back to
      // that view (Story 7.5, FR2). Plain operator words only, no kW/tariff/interval jargon, no
      // exclamation marks, no em dashes. The lens value is already a plain word (map/table/chart/
      // calendar). Composed by `describeNavigation` (src/lib/almond/skills/describe-navigation.ts).
      navigated: {
        meter: (name: string): string => `Opened ${name}`,
        // Used only if a clean meter resolve somehow lacks a name (should not happen).
        meterFallback: "the meter",
        // A meter cleared (drawer closed). The v1 skill never emits this, but the action shape admits it.
        closed: "Closed the meter",
        lens: (lens: string): string => `Showed the ${lens}`,
        filtered: (what: string): string => `Filtered the table to ${what}`,
        lensAndFilter: (lens: string, what: string): string =>
          `Showed the ${lens} and filtered to ${what}`,
        // Honest fallback if an action carried nothing recognizable (never for a clean resolve).
        fallback: "Moved the screen",
        // Suffix the filter composer appends for a ranch / rate filter so the chip reads naturally.
        ranchSuffix: (value: string): string => `${value} ranch`,
        rateSuffix: (value: string): string => `${value} meters`,
      },
      // Accessible label prefix for an action chip (the chip re-applies the same view).
      navigatedAria: (label: string): string => `${label}. Tap to return to this view.`,
      // Spreadsheet export (Epic 8). The meter-table workbook carries EVERY meter on the farm,
      // never a sample. Plain operator words only, no kW/interval jargon, no exclamation marks,
      // no em dashes. The footer states coverage so a withheld figure reads as a coverage label,
      // never a fabricated number.
      export: {
        // The single worksheet's tab name.
        sheetName: "Meters",
        // Title row written above the table.
        title: (farmName: string): string => `${farmName} meters`,
        // Footer line stating what the spreadsheet covers and what was left out (no silent
        // truncation). Every meter is included; unreconciled meters show their coverage label
        // in the money cells rather than a number. Partial billing is stated plainly as a
        // whole-percent complete (e.g. "82% complete"), never rounded to imply more than is on
        // file. An empty farm (no meters) is its own honest line, never a divide-by-zero percent.
        coverageFooter: (total: number, reconciled: number, percent: number): string => {
          if (total === 0) return "No meters on file yet, so this sheet is empty.";
          if (reconciled === total) {
            return `All ${total} meters included. Every meter has loaded billing, so this is 100% complete.`;
          }
          return `All ${total} meters included. ${reconciled} have loaded billing, so this is ${percent}% complete; the rest show their coverage state in place of a dollar figure.`;
        },
        // Footer line carrying the freshest billed cycle the farm has on file, or its honest
        // absence (never a fabricated date).
        asOf: (date: string): string => `Figures as of the bill closing ${date}.`,
        asOfNone: "No bills have posted yet, so no dollar figures are shown.",
        // Bill-due schedule export (Story 8.3): each meter's billing-cycle close, marked BILLED or
        // SCHEDULED so a planned date is never read as final (the billed-vs-scheduled law). Plain
        // operator words only, no kW/interval jargon, no exclamation marks, no em dashes.
        billDue: {
          // The single worksheet's tab name.
          sheetName: "Bill due dates",
          // Title row written above the table.
          title: (farmName: string): string => `${farmName} bill due dates`,
          // The five column headers, in order.
          columns: {
            meter: "Meter",
            ranch: "Ranch",
            serial: "Serial",
            closeDate: "Closing date",
            status: "Status",
          },
          // Status cell values. A close from a posted bill is BILLED (final); a close from the
          // read schedule is SCHEDULED and carries the "may shift" caveat so it is never read as
          // final; a meter with neither shows a coverage label, never a fabricated date.
          status: {
            billed: "Billed",
            scheduled: "Scheduled (may shift)",
            noSerial: "No serial on file",
            noSchedule: "No date scheduled",
          },
          // Empty cell when a meter has no close date to show (paired with a status above).
          noDate: "",
          // Footer line stating coverage: every meter is listed, and how the dates split between
          // billed and scheduled, so nothing is silently left out.
          coverageFooter: (total: number, billed: number, scheduled: number): string =>
            `All ${total} meters listed. ${billed} show a billed closing date and ${scheduled} show a scheduled date that may shift; the rest have no date on file.`,
          // Footer line restating the honesty rule for any reader who skips the status column.
          note: "A scheduled date is PG&E's planned meter read and may shift. It is never a billed total.",
        },
        // The exportSpreadsheet skill (Story 8.5): a one-line preview of the file Almond is about to
        // make, then the file itself as a download card. Plain operator words only, no kW/interval
        // jargon, no exclamation marks, no em dashes. Numbers and filters are stated plainly so the
        // grower knows exactly what they are getting before they open it.
        skill: {
          // Plain name of each table type, used in the preview line and on the download card.
          // `report` is the PDF report kind (Story 9.3); the spreadsheet kinds are the tables above.
          kind: {
            meters: "meters",
            billDue: "bill due dates",
            report: "report",
            workbook: "full workbook",
          },
          // The one-line preview Almond states before the file lands ("a lightweight preview, NOT an
          // approval gate"): how many meters, which table, and any filter applied. Singular/plural is
          // handled so one meter reads naturally. The filter clause is appended only when set.
          preview: (count: number, kind: string, filter: string | null): string => {
            const meterWord = count === 1 ? "meter" : "meters";
            const where = filter ? ` ${filter}` : "";
            return `I will export your ${count} ${meterWord}${where} as a ${kind} spreadsheet.`;
          },
          // The preview for the full multi-tab workbook (the rich default): names every tab so the
          // grower knows the file is the whole picture, not a single list. Singular/plural handled.
          previewWorkbook: (count: number, filter: string | null): string => {
            const meterWord = count === 1 ? "meter" : "meters";
            const where = filter ? ` ${filter}` : "";
            return `I will put together a full workbook of your ${count} ${meterWord}${where}: a summary, every meter, the bill due dates, and the rate-switch savings.`;
          },
          // The filter clause woven into the preview line (e.g. "on AG-A1", "in North ranch"). Only the
          // one filter the grower asked for is named; an unset filter contributes nothing.
          filterClause: {
            rate: (rate: string): string => `on ${rate}`,
            entity: (entity: string): string => `billed to ${entity}`,
            ranch: (ranch: string): string => `in ${ranch} ranch`,
          },
          // The download card the panel renders for the generated file. The title names the file; the
          // hint restates what it covers so the card is self-explaining.
          card: {
            // Download button label, by file kind (the SAME card renders both the spreadsheet export
            // and the PDF report, so it labels and icons itself by the file it actually carries).
            download: "Download spreadsheet",
            downloadPdf: "Download PDF",
            // Accessible label for the download control (names the file).
            downloadAria: (fileName: string): string => `Download ${fileName}`,
            // Shown when the file was kept in the grower's Reports (owner-only persistence, Story
            // 8.6), so they know it is safe to fetch again later. Absent for an unsaved export.
            savedToReports: "Saved to your Reports",
            // The in-app file preview overlay (cursor-history): a grower can look at a generated
            // report/spreadsheet before downloading it. Plain operator English.
            preview: "Preview",
            downloadShort: "Download",
            previewAria: (fileName: string): string => `Preview ${fileName}`,
            previewTitle: (fileName: string): string => `Preview of ${fileName}`,
            closePreview: "Close preview",
            previewLoading: "Loading preview",
            previewUnavailable: "This file cannot be previewed here. Download it to view.",
          },
          // Inline failure the panel renders when generation fails (typed, never a raw throw, never a
          // partial file). Calm operator English, offers a retry path by re-asking.
          error: "I could not build that spreadsheet. Ask me to try it again.",
          // Honest empty case: a filter (or an empty farm) left no meters to export, so there is no
          // file to make. Never an empty download.
          empty: "No meters match that, so there is nothing to export.",
          // Shown when an identical ask on unchanged data is served from the cache (Phase 2): the
          // same file, returned instantly, without rebuilding it.
          cached: "Here is that file again, ready to download.",
        },
        // The full multi-tab workbook (the rich default the model builds for a plain "export"/"excel"
        // ask): a Summary cover tab, the Meters inventory, the Bill due dates, and the Rate savings.
        // Each tab carries the SAME grounded values as the focused exports, so the workbook can never
        // disagree with a single-table export. Plain operator words only, no jargon, no em dashes.
        workbook: {
          // Tab names (kept under Excel's 31-char limit).
          summarySheet: "Summary",
          metersSheet: "Meters",
          billsSheet: "Bill due dates",
          savingsSheet: "Rate savings",
          // The title row at the top of each tab.
          summaryTitle: (farmName: string): string => `${farmName} overview`,
          metersTitle: (farmName: string): string => `${farmName} meters`,
          billsTitle: (farmName: string): string => `${farmName} bill due dates`,
          savingsTitle: (farmName: string): string => `${farmName} rate-switch savings`,
          // The Summary tab is a two-column key/value sheet.
          summaryColumns: { metric: "Item", value: "Value" },
          // The Summary tab's row labels, in order.
          metric: {
            farm: "Farm",
            meters: "Meters on file",
            reconciled: "Meters with loaded billing",
            completeness: "Data completeness",
            spend: "Latest month spend (loaded)",
            demand: "Demand charge (latest)",
            savings: "Estimated rate-switch savings",
          },
          // A whole-percent rendered for the completeness row (e.g. "82%").
          completeness: (percent: number): string => `${percent}%`,
          // Shown when a reconciled value is genuinely zero/absent (never a fabricated figure).
          none: "None",
          // Shown when no bill has posted, so there is no loaded figure to state yet.
          notOnFile: "No bills posted yet",
          // The Rate savings tab's five column headers, in order.
          savingsColumns: {
            meter: "Meter",
            ranch: "Ranch",
            current: "Current rate",
            suggested: "Suggested rate",
            savings: "Estimated savings",
          },
          // The bold totals band label under the savings rows.
          savingsTotal: "Total estimated savings",
          // Honest empty line when the rate review flags no changes for these meters.
          savingsEmpty: "No rate changes are flagged for these meters yet.",
          // Footer note restating that the savings come from the rate review and are an estimate.
          savingsNote: "Estimated savings come from the rate review. They are an estimate, not a guarantee.",
        },
      },
      // The PDF report Almond makes (Epic 9). A clean, trustworthy document built from a bounded set
      // of section templates (summary, meter table, mis-rated set, savings, single meter, coverage
      // footer), each rendering ONLY grounded data. Plain operator words only, no kW/interval jargon,
      // no exclamation marks, no em dashes. Every number is authored deterministically; a missing
      // value shows a coverage label, never a fabricated or zero figure.
      report: {
        // The composed document itself (Story 9.2): the title block stamped at the top of every PDF
        // and the bounds note the composer states when a section is capped, so nothing is ever
        // silently truncated. Plain operator words only, no kW/interval jargon, no exclamation marks,
        // no em dashes.
        document: {
          // The document eyebrow above the farm name, so a printed page reads as a Terra report.
          eyebrow: "Terra report",
          // The document title names the farm; the farm name is grounded data, never a claim.
          title: (farmName: string): string => `${farmName}`,
          // A single plain note stating what the PDF bounds when a section is capped, so a reader
          // never mistakes a shortened section for the whole picture. The full data is always in the
          // spreadsheet export, which has no cap. `shown`/`total` are deterministic counts.
          cappedNote: (sectionName: string, shown: number, total: number): string =>
            `${sectionName} shows the top ${shown} of ${total}. The spreadsheet export lists all ${total} with no cap.`,
        },
        // Cover section (the first page): the Terra mark, the farm name, the as-of date, and the
        // single biggest opportunity stated in dollars, plus the farm's total loaded spend and total
        // demand charge. Every figure traces to the analysis (the same numbers the dashboard shows);
        // when there is no dollar opportunity on file the cover states that plainly, never invents a
        // hero. Plain operator words, no em dashes, no exclamation marks.
        cover: {
          eyebrow: "Terra report",
          // The cover headline names the farm; the farm name is grounded data, never a claim.
          heading: (farmName: string): string => `${farmName}`,
          // The as-of line above the hero, stated plainly. When no bill has posted, the absence is
          // honest, never a fabricated date.
          asOf: (date: string): string => `Figures as of ${date}.`,
          asOfNone: "No bills have posted yet, so this report carries no dated figures.",
          // The hero label above the single biggest opportunity figure (the analysis topFinding).
          heroLabel: "Biggest opportunity",
          // The hero line: the meter name and the estimated yearly figure ("Westside Pump 17 saves
          // about $61,418 a year"). The dollar value is the analysis topFinding impact, formatted at
          // the render edge; the meter name is grounded data.
          hero: (meterName: string, amount: string): string =>
            `${meterName} could save about ${amount} a year.`,
          // The hero detail line names the rate move when the biggest opportunity is a rate switch
          // ("Move it from AG-B to AG-C"); omitted when the finding carries no rate move.
          heroRate: (fromRate: string, toRate: string): string =>
            `Move it from ${fromRate} to ${toRate}.`,
          heroRateTo: (toRate: string): string => `Move it to ${toRate}.`,
          // The hero line when the biggest finding carries a dollar but is not a rate switch (a demand
          // spike, a bill to check): the meter and the figure, framed as money worth a look.
          heroNonRate: (meterName: string, amount: string): string =>
            `${meterName} has about ${amount} worth a look.`,
          // Shown when there is no dollar opportunity on file: the cover states that plainly rather
          // than inventing a hero figure.
          heroNone: "No dollar opportunities are flagged in the data on file.",
          // The two supporting stat tiles below the hero: the farm's total loaded spend this cycle and
          // its total demand charge, both summed from the analysis (never hand-formatted).
          spendLabel: "Total loaded spend this cycle",
          spendNone: "No bills loaded yet",
          demandLabel: "Total demand charge this cycle",
          demandNone: "None on file",
        },
        // Opportunities section (the first section after the cover): the ranked rate-switch findings,
        // most savings first, with the current rate, the suggested rate, and the estimated yearly
        // dollars. This is the money-first lead. An empty set states there is nothing to switch,
        // honestly, never an empty table.
        opportunities: {
          eyebrow: "Opportunities",
          heading: "Where the money is",
          // A one-line lead above the table, stating the count and the summed estimate.
          lead: (count: number, total: string): string =>
            count === 1
              ? `One rate change could save about ${total} a year.`
              : `${count} rate changes could save about ${total} a year.`,
          columns: {
            meter: "Meter",
            currentRate: "Billed on",
            suggestedRate: "Better rate",
            savings: "Estimated yearly savings",
          },
          // The PG&E one-change-a-year caveat, restated honestly so a reader never reads the dollars
          // as stackable or guaranteed. No exclamation, no em dash.
          note: "Estimated from PG&E's published rates over the bills on file. PG&E allows one rate change per 12 months.",
          // Honest empty: nothing to switch, stated plainly.
          empty: "No rate changes are flagged in the data on file.",
        },
        // Charts section: a few plain bar charts drawn natively (no images), so the report reads at a
        // glance. Each chart states what it shows; a chart with no data states its absence honestly.
        charts: {
          eyebrow: "At a glance",
          heading: "The farm in three charts",
          demandTitle: "Highest demand charges this cycle",
          spendTitle: "Spend by entity this cycle",
          rateMixTitle: "Meters by rate",
          // Shown for a chart with no data to draw (no demand charges, no entities, no rates on file).
          empty: "Nothing to chart in the data on file.",
        },
        // Farm-summary section: the farm at a glance, a few measured stats, never a screaming hero.
        summary: {
          eyebrow: "Farm summary",
          // Section heading names the farm; the farm name is the grounded data, not a claim.
          heading: (farmName: string): string => `${farmName}`,
          // Stat tile labels.
          metersLabel: "Meters on file",
          loadedLabel: "Meters with loaded billing",
          spendLabel: "Loaded spend this cycle",
          // The loaded-spend value shows the coverage label when no meter is reconciled, never $0.
          spendNotLoaded: "No bills loaded yet",
          // The completeness line, stated plainly as a whole-percent. An empty farm is its own line.
          completeness: (total: number, reconciled: number, percent: number): string => {
            if (total === 0) return "No meters on file yet.";
            if (reconciled === total) {
              return `Every meter has loaded billing, so this is 100% complete.`;
            }
            return `${reconciled} of ${total} meters carry loaded billing, so this is ${percent}% complete.`;
          },
        },
        // Meter-table section: every meter listed, in the SAME operator headers/cells as the
        // spreadsheet export, so a withheld figure reads as its coverage label, never a number.
        meterTable: {
          eyebrow: "Meters",
          heading: "Every meter on the farm",
        },
        // Mis-rated section: meters that look billed on the wrong rate. A focused set, never a claim
        // of savings here (the savings section owns the dollars). Empty case is honest.
        misRated: {
          eyebrow: "Rate review",
          heading: "Meters that may be on the wrong rate",
          // Column headers for the focused set.
          columns: {
            meter: "Meter",
            ranch: "Ranch",
            currentRate: "Current rate",
            suggestedRate: "Suggested rate",
          },
          // Honest empty: nothing flagged, so the section states that plainly rather than an empty
          // table. Never implies a problem that the data does not show.
          empty: "No meters look mis-rated in the data on file.",
        },
        // Savings section: the dollars a rate change would have saved, summed and per meter. Every
        // figure comes from the grounded savings data; the total is a measured value, not a hero.
        savings: {
          eyebrow: "Savings found",
          heading: "Estimated savings from rate changes",
          // The summed total label (the value renders through formatUsd).
          totalLabel: "Total estimated yearly savings",
          // Per-meter columns.
          columns: {
            meter: "Meter",
            from: "Billed on",
            to: "Better rate",
            savings: "Estimated yearly savings",
          },
          // The PG&E one-change-a-year caveat, restated honestly. No exclamation, no em dash.
          note: "Estimated from PG&E's published rates over the bills on file. PG&E allows one rate change per 12 months.",
          // Honest empty: no savings found, stated plainly.
          empty: "No rate savings found in the data on file.",
        },
        // Single-meter section: one meter's detail, for a report scoped to a single pump. Every field
        // is grounded; a field not on file shows the coverage label, never a fabricated value.
        singleMeter: {
          eyebrow: "Meter detail",
          heading: (name: string): string => `${name}`,
          // Field labels.
          ranchLabel: "Ranch",
          entityLabel: "Billed to",
          rateLabel: "Rate",
          statusLabel: "Pump health",
          costLabel: "This cycle",
          demandLabel: "Demand charge",
          // Shown for a field with no value on file (never an invented value).
          notOnFile: "Not on file",
        },
        // The generateReport skill (Story 9.3): a one-line statement of the PDF Almond is about to
        // build, then the file itself as a download card (the SAME data-report card the spreadsheet
        // uses). Plain operator words only, no kW/interval jargon, no exclamation marks, no em dashes.
        // The shape is stated plainly so the grower knows what they are getting before it appears.
        skill: {
          // The default whole-document title (no single-meter scope), used in the filename slug.
          defaultTitle: "report",
          // Plain operator name of each section, woven into the one-line shape statement in selection
          // order, so the grower reads exactly what the PDF will contain before it lands.
          sectionName: {
            cover: "your biggest opportunity",
            opportunities: "where the money is",
            charts: "a few charts",
            summary: "your farm's totals",
            meterTable: "every meter",
            misRated: "the meters that may be on the wrong rate",
            savings: "the dollars on each",
            singleMeter: "the meter detail",
          },
          // The one-line shape statement Almond gives before the file appears ("a one or two page
          // summary: ..."). Lists the chosen sections in order; never an approval gate, just a courtesy
          // so the grower sees the shape first. A filter clause (e.g. "for AG-A1") is appended when set.
          preview: (parts: string, filter: string | null): string => {
            const where = filter ? ` ${filter}` : "";
            return `I will put together a one or two page summary${where}: ${parts}.`;
          },
          // Fallback when the model chose no recognizable section (the skill defaults to a farm summary
          // plus the meter table, so the PDF is never empty); states that plain default.
          defaultParts: "your farm's totals and every meter",
          // The filter clause woven into the shape statement (e.g. "for AG-A1", "in North ranch"). Only
          // the one filter the grower asked for is named; an unset filter contributes nothing.
          filterClause: {
            rate: (rate: string): string => `for ${rate}`,
            entity: (entity: string): string => `for ${entity}`,
            ranch: (ranch: string): string => `for ${ranch} ranch`,
          },
          // Inline failure the panel renders when generation fails (typed, never a raw throw, never a
          // partial file). Calm operator English, offers a retry path by re-asking.
          error: "I could not build that report. Ask me to try it again.",
          // Honest empty case: a filter (or an empty farm) left no meters, so there is nothing to put
          // in a report. Never an empty PDF.
          empty: "No meters match that, so there is nothing to put in a report.",
          // Shown when a single-meter report was asked for but the named meter was not found, so the
          // grower can correct the name rather than receive a report about the wrong pump.
          meterNotFound: (query: string): string =>
            `I could not find a meter matching "${query}", so I did not build that report.`,
        },
      },
    },
    // The finding card (situation + one action + dollars + severity + one-tap response).
    findings: {
      // Fallback action line when a stored action cannot be read; never a blank.
      actionFallback: "Review this finding",
      // One-tap responses: "Add to to-do" parks the finding on the To-do list; "Dismiss"
      // clears it. Neither executes anything — they record the grower's call.
      respondDone: "Add to to-do",
      respondDismiss: "Dismiss",
      // Disabled-state label while a response is saving.
      saving: "Saving",
      // Inline failure when a response does not stick (kept short and calm).
      respondError: "That did not save. Try it again.",
      // Trace affordance: jump the dashboard to the meter this finding is about.
      trace: (name: string): string => `Show ${name}`,
      traceAria: (name: string): string => `Show ${name} on the dashboard`,
      // Label preceding a closed-loop result note (Epic 4 fills results in).
      resultLabel: "What happened",
    },
    // Persistent badge when the dashboard is showing the representative seed, not the
    // grower's own connected account.
    representativeBadge: "Representative data",
    // Honest in-flight state (Story 5.3, AC3): the live PG&E pull is still landing, but the
    // dashboard already works off the uploaded bills, so it is never blocked on the LOA.
    pendingPull: "PG&E is connecting. Your bills are already in.",
    // Farm header.
    farmEyebrow: "Your farm",
    // Truly empty install (no farm at all). Real onboarding is Epic 5.
    noFarmTitle: "Connect a data source",
    noFarmBody: "Add a PG&E account or drop in a bill to see your farm here.",
    // KPI strip (Epic 2): a few compact cards, never a lone hero number. Coverage is honest
    // (only reconciled meters carry a figure); thin data degrades gracefully, never faked.
    kpi: {
      spendLabel: "PG&E spend",
      // Withheld when no meter is reconciled yet: never show a fabricated $0 (AR-15).
      spendNotLoaded: "No bills loaded yet",
      // An active filter that matches zero meters (the bills are fine; the view is empty).
      noMetersInView: "No meters in this view",
      coverage: (loaded: number, total: number): string =>
        `${loaded} of ${total} meters loaded`,
      demandLabel: "Demand charges",
      noDemand: "No demand charges this cycle",
      moverLabel: "Biggest cost change vs last cycle",
      vsLast: "vs last cycle",
      // Screen-reader labels for the tappable cards (the tap scrolls/opens the driver).
      spendAria: "Show the meter table",
      demandAria: "Show the meter table",
      moverAria: (name: string): string => `Open ${name}`,
    },
    // The meter table (Story 2.4): the dense Excel-style P0 lens. One row per meter; every
    // figure gated on coverage (a withheld cell reads its state, never a fabricated $0).
    table: {
      // Accessible name for the table / mobile list.
      caption: "Every meter on your account",
      columns: {
        name: "Meter",
        ranch: "Ranch",
        entity: "Entity",
        rate: "Rate",
        peak: "Peak kW",
        cost: "This cycle",
        demand: "Demand charge",
        status: "Status",
        coverage: "Coverage",
      },
      // Search + group controls (meters folded into the Energy table).
      searchPlaceholder: "Search meters",
      searchClear: "Clear search",
      groupToggle: "Group by group",
      ungrouped: "Other meters",
      groupCount: (n: number): string => (n === 1 ? "1 meter" : `${n} meters`),
      peakUnit: "kW",
      // The "Sort by" control. Default is demand charge, highest first.
      sortByLabel: "Sort by",
      sortByCustom: "Custom",
      sortOptions: {
        demand: "Demand charge (high to low)",
        cost: "This cycle's cost (high to low)",
        peak: "Peak demand (high to low)",
        group: "Meter group",
        status: "Needs a look first",
        name: "Name (A to Z)",
      },
      // One label per coverage state, reused by the drawer (2.5), CSV (2.7), map (2.9).
      coverage: {
        reconciled: "Loaded",
        needs_review: "Needs review",
        no_bill: "No bill yet",
      },
      // The legacy-rate chip when a meter sits on a closed legacy rate.
      legacyFlag: "Legacy",
      // A reconciled meter that carries no demand charge this cycle (honest absence).
      none: "None",
      // A meter with interval usage but no printed bill: a modeled cost ESTIMATE, always
      // marked as such (the "~" prefix + "est."), never presented as an actual billed figure.
      estimateSuffix: "est.",
      estimateAria: "Estimated from your interval usage, not a printed bill",
      // A solar / net-metering meter nets out over the year and settles only at the annual
      // true-up, so it never shows a monthly cost. With a printed true-up on file it shows that
      // ANNUAL figure (suffixed "true-up"); otherwise it reads the not-yet-settled state. No em
      // dashes (user-facing copy).
      notYetSettled: "Settles at true-up",
      trueUpSuffix: "true-up",
      trueUpAria: "Settles once a year at the annual true-up, not a monthly bill",
      // A null inventory field (ranch / entity / status / rate not on file). Never fabricated.
      // En dash (not an em dash): user-facing copy must never carry an em dash.
      emptyShort: "–",
      noMatch: "No meters match",
      // A farm with no meters at all yet (distinct from a filter that excluded everyone).
      emptyFarm: "No meters on this account yet",
      rowCount: (n: number): string => (n === 1 ? "1 meter" : `${n} meters`),
      // One-click CSV export of the current view (Story 2.7).
      export: "Export CSV",
      exportAria: "Download the current meter view as a CSV file",
      // Mobile simplified-list sort control.
      sortLabel: "Sort by",
      sortAscShort: "Low to high",
      sortDescShort: "High to low",
      toggleDirection: "Reverse the order",
      // Screen-reader helpers.
      openMeter: (name: string): string => `Open meter ${name}`,
      // The card button's aria-label overrides its inner text, so a flagged
      // pump's health state must ride in the label or a screen reader never
      // hears it (Story 3.6).
      openMeterFlagged: (name: string, status: string): string =>
        `Open meter ${name}. Its status is ${status}`,
      sortBy: (col: string): string => `Sort by ${col}`,
    },
    // The Chart lens (Story 2.8): TOU-stacked cost bars, the default hero face.
    chart: {
      caption: "Cost by time of use",
      buckets: {
        peak: "Peak",
        part_peak: "Part-Peak",
        off_peak: "Off-Peak",
        super_off_peak: "Super Off-Peak",
        other: "Other energy",
      },
      // Year-over-year compare.
      yoyLabel: "Compare to last year",
      yoyDisabled: "Needs a year of bills to compare",
      priorLabel: "Last year",
      // Reconciled meters whose bill carries no time-of-use detail (flat-rate bills).
      withoutTou: (n: number): string =>
        n === 1
          ? "1 meter has no time-of-use detail on its bill"
          : `${n} meters have no time-of-use detail on their bills`,
      emptyView: "No time-of-use detail in this view",
      // One bar per billing cycle now (summed across meters). The total is TOU energy dollars
      // (the chart's unit), not the full bill - say so, with how many meters rolled up.
      barAria: (label: string, total: string, meterCount: number): string =>
        `${label}, ${total} in time-of-use energy across ${meterCount} ${meterCount === 1 ? "meter" : "meters"}`,
      legendLabel: "Time-of-use periods",
    },
    // The Map lens (Story 2.9): pins from inventory, the shared drawer on tap, and an
    // honest tray for meters with no location yet.
    map: {
      caption: "Your farm on the map",
      // Disclosure summary for meters without a resolvable location.
      traySummary: (n: number): string =>
        n === 1 ? "1 meter with no location yet" : `${n} meters with no location yet`,
      attention: "Needs attention",
      calm: "Looks calm",
      pinAria: (name: string, state: string): string => `Open meter ${name}, ${state}`,
      // Wraps a pin's state when its true-up settles soon (the solar Map lens, FR35), so the ring's
      // meaning is heard as words, not conveyed by the outline alone.
      pinTrueUpSoon: (state: string): string => `${state}, true-up soon`,
      // Appended to the open pin's label while its drawer is showing (AC4 trace).
      pinOpenNote: "Its detail is open",
      emptyView: "No meters in this view",
      legendLabel: "Pin colors",
      // The base-map switch (satellite imagery vs a plain street map), mirroring the mockup.
      basemapLabel: "Base map",
      basemapSatellite: "Satellite",
      basemapStreets: "Map",
      // Screen-reader label for a pin that has a known latest bill floating above it.
      pinBillAria: (name: string, bill: string): string => `Meter ${name}, latest bill ${bill}`,
      // The Energy map's "rate" encoding: pins colored by PG&E rate family, sized by annual spend,
      // ringed when on a closed legacy schedule.
      rateLegendLabel: "Rate schedule",
      rateFamily: {
        ag_a: "AG-A",
        ag_b: "AG-B",
        ag_c: "AG-C",
        ag_other: "Other ag",
        commercial: "Commercial",
        legacy: "Legacy AG-4/AG-5",
        unknown: "Unknown rate",
      },
      ringNote: "Ringed pins are on closed legacy rates",
      sizeNote: "Bigger pins spend more per year",
      // Screen-reader label for a pin in the rate encoding (the rate is the color, so it is spoken).
      pinRateAria: (name: string, rate: string): string => `Open meter ${name}, rate ${rate}`,
      rateUnknownAria: "unknown",
      // The field-boundary underlay toggle on the Energy map.
      fieldsLabel: "Fields",
      fieldsToggleAria: (on: boolean): string =>
        on ? "Hide field boundaries" : "Show field boundaries",
      // Hover-popup field labels (a meter's facts on hover; each line is omitted when not on file).
      popup: {
        pumpId: "Pump ID",
        rate: "Rate",
        legacyTag: "legacy",
        status: "Status",
        annualSpend: "Annual spend",
        latestBill: "Latest bill",
        peak: "Peak demand",
        flow: "Flow",
        account: "Account",
        ranch: "Ranch",
      },
    },
    // The filter bar (Story 2.6): narrow the whole dashboard to an entity / ranch / rate.
    // A dimension with no values on this farm renders no control.
    filter: {
      entity: "Entity",
      ranch: "Ranch",
      rate: "Rate",
      account: "Account",
      program: "Program",
      allEntities: "All entities",
      allRanches: "All ranches",
      allRates: "All rates",
      allAccounts: "All accounts",
      allPrograms: "All programs",
      clear: "Show whole farm",
    },
    // The meter drawer (Story 2.5): the one shared drill-in, opened from any table row
    // (later chart bar / map pin). Every figure gated on coverage; a null inventory field
    // reads "Not on file", never a fabricated value.
    drawer: {
      // Screen-reader name for the dialog; announces the meter it opened.
      dialogLabel: (name: string): string => `Meter detail: ${name}`,
      close: "Close",
      closeAria: "Close meter detail",
      // Header field labels.
      pumpId: "Pump ID",
      saId: "Service agreement",
      account: "Account",
      rate: "Rate",
      legacyFlag: "Legacy",
      // Peak demand (shown in the header in place of the old legacy flag).
      peakValue: (kw: number): string => `${kw} kW peak`,
      // Intra-day load-curve graph (the meters-tab graph, reused here).
      curveTitle: "Today's draw",
      curveAria: "Representative daily load curve",
      curveNote: "Representative 15-minute shape, pinned to this meter's peak.",
      // Shown when no demand was billed: the ceiling is estimated from the meter's size,
      // so the curve still renders but is labeled honestly as an estimate.
      curveDerivedNote:
        "Representative 15-minute shape. No billed peak on file yet, so the ceiling is estimated from this meter's size.",
      curveCeiling: (kw: number): string => `Peak ${kw} kW`,
      curveNoPeak: "No demand reading yet.",
      // Billing detail section.
      billingHeader: "This cycle",
      periodRange: (start: string, close: string): string => `${start} to ${close}`,
      energyHeader: "Energy by time of use",
      energyRow: "Energy",
      kwhQty: (kwh: string): string => `${kwh} kWh`,
      demand: "Demand charge",
      demandNone: "None",
      // Plain operator English: no kW on the surface. Duration and plain force, not the unit.
      peakNote: (): string => `Pulled hard for about 15 minutes this cycle`,
      // The promoted "one short spike" callout when a demand charge is the biggest part of a bill.
      spikeHeadline: (usd: string): string => `${usd} of this bill was one short spike.`,
      spikeBody:
        "A pump pulled hard for about 15 minutes during this cycle. That one quarter hour set this charge for the whole month.",
      spikeSubLabel: "This is your demand charge.",
      otherHeader: "Other charges",
      otherRow: "Other charge",
      total: "Bill total",
      // Billing withheld / absent.
      withheldNote: "This bill needs a second look before its numbers show here.",
      // The "Confirm it" affordance (Story 5.3, AC4): a meter we could not fully read is
      // flagged for the grower to confirm, never blank-faked.
      confirmIt: "Confirm it",
      noBillNote: "No bill loaded for this meter yet.",
      noPeriodNote: "No billing detail on file yet.",
      // A solar / net-metering meter: its monthly statements are a running balance that nets out
      // and settles only once a year at the true-up, so no monthly cost is shown here. The annual
      // figure (when on file) appears in the solar section below. No em dashes (user-facing copy).
      nemUnsettledNote:
        "This meter is on net metering. Its balance settles once a year at the true-up, so there is no monthly bill figure to show. See the solar section below.",
      // MODELED cost: a meter with interval usage but no printed bill. Shown as an estimate
      // from usage + rate, clearly separated from any printed figure (never billed money).
      modeledLabel: "Estimated monthly cost",
      modeledValue: (usd: string): string => `~${usd} a month`,
      modeledNote: "An estimate from your interval usage and rate, not a printed bill.",
      historyHeader: "Past cycles",
      // Inventory section.
      inventoryHeader: "On the farm",
      ranch: "Ranch",
      entity: "Entity",
      crop: "Crop",
      gpm: "Flow",
      gpmValue: (gpm: string): string => `${gpm} gallons a minute`,
      status: "Status",
      notOnFile: "Not on file",
      // Solar / NEM section (renders only for a solar meter).
      solarHeader: "Solar",
      nemProgram: "Net metering",
      // The program-code value said the way the grower recognizes it (A-9, FR2/FR5): a recognized
      // granular six-code reads as that code; the generic token reads the generic program; an
      // absent/unrecognized token reads not-on-file - never a guessed granular code, never inferred.
      programGeneric: "NEM2",
      programNotOnFile: "Not on file",
      trueUp: "True-up month",
      nameplate: "Array size",
      nameplateValue: (kw: string): string => `${kw} kW`,
      arrays: "Arrays crediting this meter",
      arrayUnnamed: "Array",
      allocation: "Credit allocation",
      // The allocation share (C-2, FR8): the meter's usage-proportional share of its array, said as a
      // whole percent (tnum). null reads not-on-file (no billed usage, or under more than one array).
      // The credit DOLLAR beside it stays HONEST-BLANK (settled only by a true-up statement, Epic G);
      // never a fabricated zero, never a percent multiplied into a credit.
      allocationValue: (share: number): string => `${Math.round(share * 100)}% of this array`,
      allocationNotOnFile: "No usage on file",
      credit: "Credit",
      creditNotOnFile: "Not on file",
      // F-1/F-3 (FR16): the grandfather position of the meter's array. DATA-GATED on the interconnection
      // (Permission-to-Operate) date (DM1), which the launch export does not carry, so this reads
      // not-on-file at launch - honest-unknown, never a guessed vintage. The moment a date lands it
      // reads the 20-year-from-PTO expiry and the whole years remaining.
      grandfather: "Grandfathered until",
      grandfatherValue: (expiryYear: number, yearsRemaining: number): string => {
        const years = yearsRemaining === 1 ? "1 year" : `${yearsRemaining} years`;
        return `${expiryYear}, about ${years} from now`;
      },
      grandfatherNotOnFile: "Not on file",
      // DR enrollment shown as plain information (Story 3.7, FR-18). The event
      // window here is 4 to 9 in the evening (the DR clock), never the 5 to 8
      // rate peak. No savings claim, ever.
      drProgram: "Demand response",
      drProgramName: {
        pdp: "Peak Day Pricing (PDP)",
        bip: "Base Interruptible Program (BIP)",
        cbp: "Capacity Bidding Program (CBP)",
      } satisfies Record<import("@/lib/energy/dr").DrProgram, string>,
      drEnrolledNote:
        "This meter's latest bill shows demand response enrollment. PG&E can call events from 4 to 9 in the evening.",
      months: [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
      ] as const,
      // Findings seam (cards arrive with the recommendation engine, Epic 3).
      findingsHeader: "Findings",
      findingsEmpty: "Nothing needs you on this meter right now.",
      // Bill-accuracy verification badge (Story 4.1, FR-19). Two honest layers:
      //  - Layer 1 (cent-exact): the bill's line items add to PG&E's printed total
      //    to the cent. This is the Epic-1 reconciliation fact; "cent" lives ONLY in
      //    this sentence.
      //  - Layer 2 (the recompute): Terra recalculated the bill independently from
      //    the published rates and matched PG&E's total - worded as "matched", never
      //    to the cent, and NEVER as predict / forecast / projection (AC3, NFR-5).
      // The badge renders only when the recompute landed inside the calibrated band;
      // a miss or an uncheckable bill shows nothing here.
      verifiedLabel: "Bill checks out",
      verifiedCaption:
        "The charges on this bill add up to PG&E's printed total to the cent. Terra also recalculated this bill independently from the published rates and your usage, and the result matched PG&E's total.",
      // Screen-reader prefix so the badge is never color-only (icon + text carry it).
      verifiedAria: "Verified: ",
      // Recommendation predicted-vs-realized results (Story 4.2, FR-20): accepted
      // recommendations tracked against the next bill. Reads "pending" until a bill
      // posts after acceptance (by design in v1). Two facts side by side, never
      // attributed savings: the prediction we recorded and what the next bill was.
      // No subtraction of the two - the prediction (e.g. an annual lever saving) and
      // a single bill are not the same quantity, so a "difference" would mislead;
      // never claim the grower saved it, never explain the variance.
      resultsHeader: "What happened",
      resultPredictedLabel: "Predicted",
      resultRealizedLabel: "Next bill",
      resultPending: "Pending the next bill",
      resultNoEstimate: "No dollar estimate",
    },
  },
  pumpTiming: {
    /** "June 14" style date (zero-based month index). */
    dateLabel: (monthIndex: number, day: number): string =>
      `${MONTHS[monthIndex] ?? ""} ${day}`.trim(),
    monthLabel: (monthIndex: number): string => MONTHS[monthIndex] ?? "",
    names: joinNames,

    retrospective: {
      situation: (month: string, demandUsd: number): string =>
        `Last ${month} this pump's bill had a demand charge of ${usd(demandUsd)}.`,
      avoidable: (date: string, avoidedUsd: number): string =>
        `On ${date} you set a peak bigger than the rest of the month. That one afternoon added about ${usd(avoidedUsd)} to the charge, and spreading that load would have saved it.`,
      action: (date: string): string => `See the ${date} spike`,
    },

    coincident: {
      situation: (pumps: string): string =>
        `${pumps} run at the same time in the evening, stacking into one big spike on your bill.`,
      action: (hold: string, until: string): string =>
        `Hold ${hold} until ${until} finishes`,
      impact: (savedUsd: number): string =>
        `Staggering them keeps your peak down and saves about ${usd(savedUsd)}.`,
    },

    cycleEdge: {
      situation: (pump: string, days: number): string =>
        `Your ${pump} billing cycle closes in ${days === 1 ? "1 day" : `${days} days`} and this month's peak is still low.`,
      action: (closeDate: string): string =>
        `Hold big sets until after ${closeDate}`,
      impact: (freshUsd: number): string =>
        `Running a full set now would lock in a fresh demand charge of about ${usd(freshUsd)} for the few days left in the cycle.`,
    },

    offPeak: {
      situation: (pump: string): string =>
        `The ${pump} set runs into the 4 to 9 evening window, your costliest hours.`,
      action: (): string => `Move it before 4pm or after 9pm`,
      impact: (savedUsd: number): string =>
        `Shifting it off the evening peak could save up to about ${usd(savedUsd)}.`,
    },

    reconcile: {
      situation: (cycle: string): string =>
        `Your ${cycle} bill posted, so here is how it closed out.`,
      summary: (
        followed: number,
        total: number,
        chargeUsd: number,
        avoidedUsd: number,
      ): string =>
        `You followed ${followed} of ${total} holds. Your demand charge was ${usd(chargeUsd)}, and you avoided about ${usd(avoidedUsd)}.`,
      action: (): string => `See how the month closed out`,
    },

    // The calendar home: the simplest view, graspable in seconds.
    home: {
      eyebrow: "Rates and billing",
      headline: (meters: number, entities: number): string =>
        `${meters} meters across ${entities === 1 ? "1 entity" : `${entities} entities`}.`,
      needLook: (n: number): string =>
        n === 0
          ? "Nothing needs a look this cycle."
          : n === 1
            ? "1 thing needs a look this cycle."
            : `${n} things need a look this cycle.`,
      findingsTitle: "What we found",
      /** The eyebrow on the single biggest finding, lifted out above the rest. */
      heroKicker: "Your biggest finding",
      /** One-line scale of the rate opportunity across the metered pumps. */
      fleetRollup: (totalUsd: number, count: number): string =>
        `About ${usd(totalUsd)} a year in wrong-rate savings, found across ${count} metered ${count === 1 ? "pump" : "pumps"} so far.`,
      /** Re-runs the engine against the latest meter history. */
      recheck: "Recheck for savings",
      noFindings:
        "No findings yet. As your bills come in, anything worth money lands here.",
      calendarTitle: (monthLabel: string): string => `Billing cycles, ${monthLabel}`,
      closingSoon: "Closing soon",
      /** "June 14: 62 meters close." */
      closesOn: (date: string, meters: number): string =>
        `${date}: ${meters === 1 ? "1 meter closes" : `${meters} meters close`}.`,
      legendAct: "Money on the table",
      legendWatch: "Worth a look",
      legendClear: "All clear",
      /** Short weekday headers for the month grid (Sunday first). */
      weekdays: ["S", "M", "T", "W", "T", "F", "S"] as const,
      perYear: "a year",
      seeAll: "See all meters",
    },

    // The one-tap responses on a finding card. Map to the Recommendation status.
    findings: {
      done: "Done",
      notNow: "Not now",
      runningAnyway: "Running anyway",
      doneState: "Marked done",
      dismissedState: "Set aside",
      overriddenState: "Running anyway",
    },
  },

  // Lever 1: rate optimization. The headline finding, a meter on the wrong rate.
  rateOptimization: {
    situation: (pump: string, from: string): string =>
      `${pump} is billed on ${from}. Looking at a full year of how it actually runs, that is the wrong rate.`,
    action: (to: string): string => `Move it to ${to}`,
    impact: (to: string): string =>
      `${to} fits how this pump runs. Same pumping, just a rate that stops charging you for a peak you rarely hold.`,
    lowConfidence: (pct: number): string =>
      `Our model of this bill is off by ${pct}%, so treat this as a rough estimate until we reconcile the real bills.`,
    /** The trust line: we reproduced their real bill before quoting a counterfactual. */
    matchedWithin: (pct: number): string =>
      pct <= 0
        ? "We rebuilt last year's bills from PG&E's published rates and matched your real total to the dollar."
        : `We rebuilt last year's bills from PG&E's published rates and matched your real total within ${pct}%.`,

    // The real lever (Story 3.3): savings computed from the dated card over the
    // meter's own reconciled bills, quoted only when the back-test gate passes.
    lever: {
      situation: (pump: string, from: string, to: string): string =>
        `${pump} is on ${from}. PG&E's current ${to} rate prices the same use lower.`,
      // The labeled estimate (never cent-exact) with the rates used, the rate
      // effective date, the billed-days basis, and the switch constraint.
      estimate: (savings: string, days: number, from: string, to: string, effective: string): string =>
        `Estimated savings ~${savings} over the last ${days} days of bills, figured from PG&E's published ${from} and ${to} rates effective ${effective}. PG&E allows one rate change per 12 months.`,
      // A legacy meter that gets no dollar figure: qualitative, no number. The
      // note states the TRUE reason - bills that did not match, bills that
      // matched but showed no savings, or solar billing that settles at true up.
      legacySituation: (pump: string, from: string): string =>
        `${pump} is still on ${from}, a closed rate PG&E no longer offers.`,
      legacyNote: (): string =>
        "Terra could not match this meter's bills closely enough to quote a dollar figure yet. We keep checking as new bills load.",
      legacyNoSavingsNote: (): string =>
        "Its bills match PG&E's published rates, and no current rate prices its recent use lower yet. Terra keeps checking as new bills load.",
      legacySolarNote: (): string =>
        "This meter's solar billing settles at its annual true up, so monthly bills do not show its full cost. Terra will check its rate when the true up data loads.",
      legacyAction: (): string => "Review this meter's rate",
    },

    // One aggregate finding for the meters still parked on closed legacy rates.
    legacyFleet: {
      situation: (n: number): string =>
        `${n} meters are still on closed legacy rates that PG&E stopped offering years ago.`,
      action: (): string => "Review the legacy-rate meters",
      note: (): string =>
        "Legacy rates often run higher than today's. As each meter's full history loads, Terra checks it for a cheaper current rate.",
    },
  },

  // Demand-charge exposure: one mistimed start can set the whole cycle's demand charge.
  // The situation/avoidable copy is shared with the retrospective lever (see pumpTiming).
  demandCharge: {
    // Shown on the at-risk hero subtitle when one or more spikes are open.
    heroNote: (count: number): string =>
      count === 1
        ? "One mistimed pump start set a demand charge you can avoid next cycle."
        : `${count} mistimed pump starts set demand charges you can avoid next cycle.`,
  },

  // Bill audit: a posted charge that looks higher than the meter's own usual cycle,
  // with no matching jump in usage. Honest framing: "looks higher than usual," never
  // "PG&E overcharged you." The farmer checks the bill; Terra only flags the anomaly.
  billAudit: {
    situation: (pump: string, month: string): string =>
      `${pump}'s ${month} bill came in higher than its usual month, but its usage did not go up.`,
    impact: (excessUsd: number, month: string): string =>
      `This bill is about ${usd(excessUsd)} over what this meter usually runs in a comparable month, and the metered usage did not rise to match. Worth checking the ${month} statement.`,
    action: (month: string): string => `Check the ${month} bill`,
  },

  // Lever 4: solar / NEM. Solar offsets daytime energy, not the evening demand peak.
  solar: {
    // The honest-blank / honest-unknown primitive (G-0). ONE shared set of words for "not on file
    // yet", rendered identically everywhere via <HonestBlank>, so every later net-metering dollar cell
    // imports it instead of re-inventing the phrasing and the grower learns the state once. The one
    // law: program structure and timing are on file; net-metering dollar credits are not - so a credit
    // cell with no statement reads as a deliberate, settled absence (with the non-salesy upload path),
    // never an error, a guess, a zero, or a bare dash. Plain operator English, no exclamation marks,
    // no em dashes.
    honestBlank: {
      // The dollar honest-BLANK label: a net-metering credit with no backing statement on file.
      blank: "Not on file yet",
      // The non-salesy path that turns the blank into a settled value (the upload-to-settle action).
      // Plain and optional - never a sales pitch, just the way to fill the gap when the grower has it.
      uploadToSettle: "Upload the true-up statement to settle this",
      // The structural honest-UNKNOWN label: a non-dollar datum (a nameplate, a true-up month, an
      // array link) genuinely absent. Distinct from the dollar blank - there is nothing to upload to
      // settle a missing structural fact, so it carries no upload path.
      unknown: "Not on file",
      // The accessible announcement for each absence, so a screen reader reads the state as content
      // ("Not on file yet"), never an empty cell it skips. Includes what the absent thing is.
      blankAria: (what: string): string => `${what}: not on file yet`,
      unknownAria: (what: string): string => `${what}: not on file`,
    },
    // The true-up statement upload on-ramp (G-3, FR37/FR28/FR14). The single way a net-metering dollar
    // flips from honest-blank to a settled value: a grower uploads their true-up statement PDF and it
    // routes through the SAME fail-closed extract pipeline the bill upload uses (the PDF never touches
    // the repo, client, or anything the agent can read, NFR10). On an exact match the dollar settles;
    // an unmatched or unreadable statement leaves every dollar honest-blank, never a partial or guessed
    // figure. Role-gated to owner/manager (a viewer never sees the affordance). Plain operator English,
    // no exclamation marks, no em dashes.
    statementUpload: {
      // The header-level affordance on the Solar tab.
      title: "Settle your true-up",
      body: "Upload your PG&E true-up statement and Terra fills in the credit the moment it reads it.",
      // The accepted formats hint.
      hint: "A PDF of your annual true-up statement.",
      // The one button (the file picker; the form self-submits on choose, like the onboarding upload).
      cta: "Upload statement",
      uploading: "Reading your statement",
      // The chosen-file label while the server reads it.
      chosen: (name: string): string => `Reading ${name}`,
      // The settled confirmation after an exact match populates the dollar.
      settled: "Statement read. Your true-up credit is now on file.",
      // The needs-review feedback when the statement could not be matched or read cleanly: nothing is
      // guessed, the dollar stays honest-blank, and the grower is told plainly to try a clearer file.
      needsReview:
        "We could not match that statement to a meter yet, so nothing changed. Try a clearer PDF of the full statement.",
      // The error feedback for a missing/unreadable file (before extraction even runs).
      error: "Choose a PDF of your true-up statement first.",
      // The role-gate / no-farm fallback (a viewer or an unauthenticated caller).
      denied: "You do not have permission to upload a statement to this farm.",
    },
    // The Solar tab shell (A-1). Eyebrow over the farm name on /solar, and the
    // empty-but-structured placeholder shown before the lenses arrive (A-2 onward).
    tab: {
      eyebrow: "Your solar",
      // Shown in the data hero until the lens set ships (A-2 onward). Never a crash
      // or a blank shell; a calm line that the surface is assembling.
      placeholderTitle: "Your solar fleet, coming into view",
      placeholderBody:
        "Your arrays, true-up dates, and meter-by-meter solar are assembling here.",
    },
    // The solar lens toggle (A-2): Arrays . Calendar . Map . Table, defaulting to Arrays
    // (the aggregation map is the at-a-glance win). One solar dataset, one lens at a time.
    lensLabel: "View",
    lens: {
      arrays: "Arrays",
      calendar: "Calendar",
      map: "Map",
      table: "Table",
    },
    // Honest placeholder shown for a solar lens whose view has not shipped yet (A-2 scaffolds the
    // toggle and the lens region; the Arrays, Map, Table, and Calendar views arrive in later stories).
    lensComing: "This view is on the way.",
    // The Map lens (A-6, FR35, UX-DR6): the solar fleet placed geographically, reusing the shared
    // maplibre map. Launch-data pins only - the three signals already on the meter at launch:
    // coverage state (the needs-a-look / looks-calm hue), that the meter is on solar (every placed pin
    // is pre-filtered to a solar meter), and true-up soon (a quiet ring around the dot when the annual
    // settle is within the next few months). A plain-word legend pairs each signal with words. NO
    // array-health pin (no backing field at launch). An honest tray lists any solar meter with no
    // resolvable location (never placed at a guessed point) AND a labeled list names the true-up-soon
    // meters, so the ring's meaning is also readable as words. No dollar floats above a solar pin (a
    // true-up credit is honest-blank until a statement is on file).
    map: {
      // Plain-word legend, paired with each pin signal.
      legendLabel: "Pin colors",
      attention: "Needs a look",
      calm: "Looks calm",
      // The third launch signal (FR35): a quiet ring around the dot when the true-up settles soon.
      trueUpSoon: "True-up soon",
      // Disclosure summary for solar meters without a resolvable location (listed, not placed).
      traySummary: (n: number): string =>
        n === 1 ? "1 solar meter with no location yet" : `${n} solar meters with no location yet`,
      // Disclosure summary naming the solar meters whose true-up settles soon, so the ring signal is
      // also present as words (color/outline is never the only signal).
      trueUpSoonSummary: (n: number): string =>
        n === 1 ? "1 solar meter with a true-up soon" : `${n} solar meters with a true-up soon`,
      // Open the drawer on a meter row in either tray (Map-namespaced, not borrowed from Arrays).
      openMeter: (name: string): string => `Open ${name}`,
      // Shown when no solar meter has a location and none is listed (never a crash or a blank region).
      emptyView: "No solar meters to place on the map yet.",
    },
    // The solar KPI strip (A-3, UX-DR2): four calm tiles - solar meters, arrays, next true-up,
    // needs review. NO dollar tile (money is never the hero here). Counts count up once
    // (reduced-motion-safe); the needs-review tile is plain typography with no color.
    kpi: {
      // Tile labels (label-caps eyebrow over each count).
      metersLabel: "Solar meters",
      arraysLabel: "Arrays",
      trueUpLabel: "Next true-up",
      reviewLabel: "Needs review",
      // The solar-meter sub-line under the count.
      metersSub: (n: number): string =>
        n === 0
          ? "No solar meters on this farm yet"
          : `${n === 1 ? "1 meter has" : `${n} meters have`} solar`,
      // The arrays sub-line.
      arraysSub: (n: number): string =>
        n === 0 ? "No arrays linked yet" : n === 1 ? "1 array" : `${n} arrays`,
      // Next true-up: a plain-words month plus how far out it settles. monthName is 1-12.
      trueUpMonthName: (month: number): string => MONTHS[month - 1] ?? "",
      trueUpValue: (month: number): string => MONTHS[month - 1] ?? "",
      // "settling this month" / "about 6 weeks out" - plain operator words, never a clock-precise date.
      trueUpLead: (monthsAhead: number): string => {
        if (monthsAhead <= 0) return "Settling this month";
        if (monthsAhead === 1) return "About 4 weeks out";
        return `About ${monthsAhead} months out`;
      },
      trueUpNone: "No true-up date on file yet",
      trueUpCount: (meterCount: number): string =>
        meterCount === 1 ? "1 meter settles then" : `${meterCount} meters settle then`,
      // Needs review: the count of solar meters not yet linked to an array. Zero reads as calm.
      reviewValue: (n: number): string => (n === 0 ? "All linked" : String(n)),
      reviewSub: (n: number): string =>
        n === 0
          ? "Every solar meter is linked to an array"
          : `${n === 1 ? "1 meter is" : `${n} meters are`} not linked to an array`,
      // Screen-reader labels for the tappable tiles (UX-DR2: tap Next true-up -> Calendar lens;
      // tap Needs review -> filter the surface to those meters).
      trueUpAria: "See the true-up calendar",
      reviewAria: "Show meters that need review",
    },
    // The Arrays lens (A-5, UX-DR4): the default data hero. One array-group card per SolarArray,
    // header with the array name + nameplate said in plain words + true-up month, and the benefiting
    // meters as rows with a program-code chip and a share row. The share and the credit DOLLAR render
    // HONEST-BLANK until Epic C/G fill them - never a fabricated zero, never a percent-times-dollar
    // credit. Plain operator English, no kW/interval jargon, no exclamation marks, no em dashes.
    arrays: {
      // The array-group card.
      nameplate: (kw: number): string => `${num(kw)} kW solar`,
      // The array's true-up month said in plain words ("Settles in September"); null reads honest.
      trueUpMonth: (month: number): string => `Settles in ${MONTHS[month - 1] ?? ""}`,
      trueUpNone: "No true-up month on file",
      // The unnamed-array fallback (the populator wrote no name).
      unnamed: "Array",
      // C-3 (FR11): the array's program type said in plain operator English (never the raw token).
      // "nem" is single-meter solar (the array credits its own meter); "nema" is aggregation where
      // PG&E controls the split (PG&E's usage-weighted formula spreads one array's credits across N
      // meters and the grower cedes control of where they go); "vnem" is aggregation where you set the
      // split (the system owner picks the allocation percentages). VNEM is forward-compatible with no
      // launch instance. The label never shows the raw NEMA / VNEM / "Virtual NEM" term (ux-spec).
      programType: (kind: "nem" | "nema" | "vnem", meterCount: number): string => {
        if (kind === "vnem") return `Aggregation across ${meterCount} meters (you set the split)`;
        if (kind === "nema") return `Aggregation across ${meterCount} meters (PG&E sets the split)`;
        return "Single-meter solar";
      },
      // The benefiting-meter rows section heading inside each card.
      metersHeading: "Meters this array credits",
      // The meter row's nameplate said in plain words; null reads not-on-file (never inferred).
      meterNameplate: (kw: number): string => `${num(kw)} kW`,
      // The program-code chip for the generic token, and the not-on-file granular note. A-5 renders
      // the raw NEM token quietly; A-4's program-code component refines the plain-English meaning.
      programGeneric: "NEM2",
      programNotOnFile: "Program not on file",
      // The share row label and the share/credit cells. C-2 computes the usage-proportional share %
      // from billed usage; a meter with no billed usage on file reads not-on-file (never a zero that
      // would read as dropped). The credit DOLLAR stays honest-blank until a statement settles it.
      shareLabel: "Share of this array",
      // The usage-proportional share said as a whole percent (tnum), e.g. "75% of this array".
      sharePercent: (share: number): string => `${Math.round(share * 100)}% of this array`,
      shareNotOnFile: "No usage on file",
      creditLabel: "Credit",
      creditNotOnFile: "Not on file",
      // Open the drawer on a meter row.
      openMeter: (name: string): string => `Open ${name}`,
      // Empty + no-array states (never a crash or a blank region).
      noArrays: "No arrays linked to your solar meters yet.",
      // A solar meter that lists no array (counted in needs-review): listed here so it is never
      // silently dropped from the Arrays lens.
      unlinkedHeading: "Solar meters not yet linked to an array",
      unlinkedNote: "We could not match these to an array. Check them against your records.",
      // C-1 (FR6): array codes meters referenced but no generating meter defined, surfaced here as
      // needs-review rather than silently dropped. The code is shown verbatim, never a guess.
      unlinkedCodeHeading: "Array codes with no generating meter",
      unlinkedCodeNote:
        "Some meters list these array codes, but no meter on file generates them. Check the codes against your records.",
      unlinkedCode: (code: string): string => `Code ${code}`,
      // DM4 (FR6): the populated solar nameplate is shown CAUTIOUSLY until the export's column layout
      // is verified for this farm. Never suppressed, never presented as confirmed. Plain words.
      nameplateUnverified: "Layout not verified yet",
      nameplateUnverifiedNote:
        "These solar sizes come from your import before its column layout was checked. We show them as read, not as confirmed.",
    },
    // The Table lens (A-8, UX-DR7, FR36): the Excel bridge. Meters down, solar columns across,
    // filterable and sortable, with a one-click CSV export the farm-office controller can stop
    // maintaining the parallel array-to-meter spreadsheet by hand. The allocation % column and the
    // credit DOLLAR are HONEST-BLANK until Epic C/G fill them, exported as the literal "not on file"
    // marker (never a blank cell that reads as zero). Plain operator English, no kW/interval jargon.
    table: {
      // Accessible name for the table / mobile list.
      caption: "Every solar meter on your account",
      // The solar table column headers, in order. These also author the CSV header row, so the export
      // and the on-screen table can never drift to different headers.
      columns: {
        name: "Meter",
        program: "Program",
        nameplate: "Solar size",
        array: "Array",
        allocation: "Share",
        trueUp: "True-up",
        coverage: "Coverage",
      },
      // The program-code cell: the generic NEM2 token reads as the generic program; an absent or
      // unrecognized token reads not-on-file, never a guessed granular code (FR2/FR5).
      programGeneric: "NEM2",
      programNotOnFile: "Not on file",
      // The nameplate cell said in plain words ("840 kW"); null reads not-on-file (never inferred, FR3).
      nameplate: (kw: number): string => `${num(kw)} kW`,
      nameplateNotOnFile: "Not on file",
      // The array-membership cell: the arrays this meter sits under, joined; none reads not-on-file.
      arrayNone: "Not on file",
      // A meter linked to more than one array reads each name, joined with this separator.
      arrayJoin: " · ",
      // The allocation % cell: honest-blank until Epic C computes the usage-proportional share. The CSV
      // exports this marker, never a blank cell that reads as zero (FR36).
      allocationNotOnFile: "not on file",
      // The true-up month cell said in plain words; null reads not-on-file.
      trueUpMonth: (month: number): string => MONTHS[month - 1] ?? "",
      trueUpNone: "Not on file",
      // The allocation-map section that follows the per-meter rows in the CSV (FR36): one header line,
      // then one line per array naming each benefiting meter and its honest-blank share. So the
      // controller's exported sheet carries the same array-to-meter graph the Arrays lens shows.
      mapSectionTitle: "Array to meter allocation",
      mapArrayLabel: "Array",
      mapNameplateLabel: "Solar size",
      mapMeterLabel: "Meter",
      mapShareLabel: "Share",
      // One-click CSV export of the current solar view.
      export: "Export CSV",
      exportAria: "Download the current solar view as a CSV file",
      rowCount: (n: number): string => (n === 1 ? "1 solar meter" : `${n} solar meters`),
      // Empty + filtered-out states (never a crash or a blank region).
      empty: "No solar meters on this account yet",
      noMatch: "No solar meters match",
      // Mobile simplified-list sort control.
      sortLabel: "Sort by",
      toggleDirection: "Reverse the order",
      sortBy: (col: string): string => `Sort by ${col}`,
      openMeter: (name: string): string => `Open meter ${name}`,
    },
    demandPeak: {
      situation: (pump: string): string =>
        `${pump} has solar, but its bill peak is set after 4pm.`,
      action: (): string => "See why solar is not cutting this charge",
      impact: (chargeUsd: number): string =>
        `Your panels cover daytime power, but the demand charge of about ${usd(chargeUsd)} is set in the evening when they are nearly off. Solar is not lowering it.`,
    },
    trueUp: {
      situation: (pump: string, month: string): string =>
        `${pump} settles its solar credits once a year, in ${month}.`,
      action: (month: string): string => `Track the ${month} true-up`,
      impact: (month: string): string =>
        `This is a NEM2 account, so the credits and charges net out at the ${month} true-up. Watch the running balance so that bill is not a surprise.`,
    },

    // Story 3.4: the canonical NEM demand insight, computed from the printed NEM
    // months + reconciled demand charges. The peak named here is the 5-8pm
    // evening rate peak (tou.ts), never the 4-9pm event window.
    insight: {
      // One phrase per energy position, SCOPED to the statement-month count so
      // the claim never outruns the evidence (a winter window can contradict
      // the annual position).
      positionPhrase: (
        position: "net_zero" | "net_credit" | "net_consumer",
        months: number,
      ): string => {
        const span = months === 1 ? "its last solar statement" : `its last ${months} solar statements`;
        if (position === "net_zero") return `made about as much power as it used across ${span}`;
        if (position === "net_credit") return `made more power than it used across ${span}`;
        return `used more power than its solar made across ${span}`;
      },
      situation: (pump: string, positionPhrase: string): string =>
        `${pump} ${positionPhrase}, but solar does not lower its demand charge. That charge is set by its single biggest draw, usually in the evening between 5 and 8 when the panels are nearly off.`,
      note: (demandUsd: string): string =>
        `About ${demandUsd} of its bills on file is the demand charge, which solar cannot reduce.`,
      // E-2 (FR21): the same note with the uncovered share said beside the dollar - the
      // portion of the bill solar does not touch, as a whole percent (never a credit
      // claim, never a percent multiplied into a dollar).
      noteWithShare: (demandUsd: string, uncoveredPct: number): string =>
        `About ${demandUsd} of its bills on file is the demand charge, which solar cannot reduce. That is about ${uncoveredPct}% of the bill solar does not cover.`,
      // E-2 (FR23): the floor labels - the charges solar categorically does not offset,
      // shown as a labeled group separated from any net-metering balance so no layout
      // reads as a composite "solar saved you X".
      floorHeading: "What solar does not cover",
      floorDemand: "Demand charge",
      floorService: "Service charge",
      floorNbc: "Non-bypassable charges",
      floorTotal: "Bill floor",
      // The uncovered share said under the demand charge, as a whole percent.
      floorUncoveredSub: (uncoveredPct: number): string =>
        `about ${uncoveredPct}% of the bill solar does not cover`,
      action: (): string => "See its evening demand",
      // Drawer NEM section labels (the printed solar facts).
      drawerPosition: "Solar balance",
      drawerPositionValue: {
        net_zero: "About even, made and used",
        net_credit: "Made more than it used",
        net_consumer: "Used more than it made",
      } as Record<"net_zero" | "net_credit" | "net_consumer", string>,
      drawerNemCharges: "Solar charges on file",
      drawerTrueUpAmount: "Last true up",
      drawerDemandOwed: "Demand charge, not covered by solar",
      // A negative printed amount is a credit to the grower; say so in words.
      creditValue: (usd: string): string => `${usd} credit`,
    },
    // G-2 (FR23, UX-DR11): the honest-dollar separation guard. The ONE honest dollar a solar finding
    // is allowed to carry is a BILLING charge already printed on the bill (the F2 demand-charge gap,
    // and later any rate-fit dollar) - never a net-metering credit, which stays honest-blank until a
    // statement settles it. Wherever such a billing dollar renders beside a net-metering honest-blank,
    // it carries this explicit chip so the two can never be read as one composite "solar saved you X"
    // figure: the chip names it a charge on the bill, separated from the credit story. Plain operator
    // English, no exclamation marks, no em dashes.
    findingLabel: {
      // The chip over the F2 demand-charge dollar (a real charge on the bill, never a credit).
      billing: "On your bill",
      // The chip over a staged priced rate-fit dollar (forward-compatible; v1 F1 is dollarless).
      rate: "Rate finding",
      // The screen-reader-first clarification that the dollar is a charge, never a solar credit.
      billingAria: "This is a charge on your bill, not a solar credit",
    },
    // C-4 (FR9): the allocation audit finding (F3). Two honest gaps to verify with PG&E - a meter
    // dropped from an array it lists, or a recorded share that diverges from the load-implied share -
    // each a "check this" signal, never a dollar (the credit stays honest-blank, FR10). Severity is
    // watch (no color, no impactUsd). Copy names the meter and the array so the finding traces to what
    // the grower sees on the tab. Plain operator English, no kW/interval jargon, no exclamation marks.
    aggregation: {
      // A meter that lists an array but is absent from that array's allocation: its credits may be
      // going nowhere. Names the meter and the array.
      droppedSituation: (meter: string, array: string): string =>
        `${meter} lists the ${array} array but is not sharing in its credits. Its solar credits may be going to the wrong place.`,
      // A solar meter that is not linked to ANY array, so no array's credits reach it. Names the meter.
      unlinkedSituation: (meter: string): string =>
        `${meter} is a solar meter but is not linked to any array, so it is not sharing in any solar credits. Check which array it belongs to.`,
      // A recorded share that diverges from the usage-based share by more than the tolerance.
      mismatchedSituation: (
        meter: string,
        array: string,
        computedPct: number,
        recordedPct: number,
      ): string =>
        `${meter} uses about ${Math.round(computedPct)}% of the ${array} array, but its credits are recorded at ${Math.round(recordedPct)}%. That gap is worth checking.`,
      action: (): string => "Check this share with PG&E",
      // The honest-blank dollar note (the credit is never quantified until a statement settles it).
      note: "We cannot put a dollar on this until your true-up statement is on file.",
      // The unnamed-array fallback used in the situation copy when the populator wrote no array name.
      unnamedArray: "unnamed",
      // The inline watch-treatment rows on the Arrays-lens array card (UX-DR4: typographic, no color).
      // A short label for a meter row flagged by the audit, so the card echoes the finding.
      droppedRow: (meter: string): string => `${meter} is not sharing in this array's credits`,
      mismatchedRow: (meter: string, computedPct: number, recordedPct: number): string =>
        `${meter} uses about ${Math.round(computedPct)}% but is credited ${Math.round(recordedPct)}%`,
      // The section heading above the inline audit rows on a card.
      reviewHeading: "Worth checking",
    },
    // The F1 rate-legibility finding (E-3, FR24/FR25): a solar meter on a demand-charge AG-C schedule
    // that measures low operating hours is a candidate for the wrong schedule, worth verifying. This
    // is a NON-dollar flag: the priced rate-fit on a solar meter is staged, and the net credit hides
    // the underlying rate, so the copy says exactly that and never quotes a $/kW or $/kWh. Plain
    // operator English, no exclamation marks, no em dashes.
    rateLegibility: {
      // Names the meter and the schedule; says the schedule may not fit a low-hours solar meter.
      situation: (meter: string, schedule: string): string =>
        `${meter} runs on the ${schedule} demand-charge schedule but does not show many operating hours. That schedule fits a meter that runs a lot, so it is worth checking whether it still fits this one.`,
      // The honest-blank dollar acknowledgement: the net credit obscures the rate, so no figure here.
      note: "Your solar credit hides what the underlying rate is doing, so we cannot put a dollar on this yet. The schedule is still worth a look.",
      action: (): string => "Check this schedule",
    },
    // The F4 grandfather watch (F-3, FR16/FR17): a grandfathered NEM2 array nears its 20-year-from-PTO
    // expiry, and expanding its capacity beyond the tariff threshold would forfeit that grandfathered
    // value early. DATA-GATED on the interconnection date (DM1): this only ever speaks where a real PTO
    // date is on file - the launch fleet has none, so it stays silent. A protect-what-you-have signal
    // with NO dollar (impactNote only). Plain operator English, no exclamation marks, no em dashes.
    grandfather: {
      // Names the array, the expiry year, and the whole years remaining. Frames protection, not purchase.
      situation: (array: string, expiryYear: number, yearsRemaining: number): string => {
        const years = yearsRemaining === 1 ? "1 year" : `${yearsRemaining} years`;
        return `The ${array} array keeps its grandfathered net-metering terms until ${expiryYear}, about ${years} from now. Expanding it beyond the program limit would give those terms up early, so plan any changes around that.`;
      },
      // No dollar: the value of the grandfathered terms is real but not a single figure we can quote.
      note: "We cannot put a dollar on the grandfathered terms, but they are worth protecting. Keep any expansion within the program limit.",
      action: (): string => "Protect the grandfathered terms",
      // The unnamed-array fallback when the populator wrote no array name.
      unnamedArray: "unnamed",
    },
    // The F5 aging-array flag (F-3, FR19/FR20): an array is producing meaningfully below its
    // age-adjusted expectation, sustained over a real evidence window. DATA-GATED on a per-array
    // generation series (DM2), which the launch export does not carry - so this stays silent today.
    // Names its evidence window, never an annual claim from a sub-window. NO dollar (impactNote only):
    // the dollars-lost figure is per-site variable. Plain operator English, no exclamation marks.
    aging: {
      // Names the array, the shortfall percent, and the evidence window (the number of months of data).
      situation: (array: string, shortfallPct: number, monthsObserved: number): string => {
        const months = monthsObserved === 1 ? "1 month" : `${monthsObserved} months`;
        return `Across ${months} of generation data, the ${array} array is producing about ${shortfallPct}% below what its age suggests it should. That is worth investigating before the next season.`;
      },
      // No dollar: the value lost depends on the site, so we name the shortfall, not a figure.
      note: "We cannot put a dollar on the shortfall, since that depends on the site. The drop itself is worth a closer look.",
      action: (): string => "Investigate this array",
      // The unnamed-array fallback when the populator wrote no array name.
      unnamedArray: "unnamed",
    },
    // The F7 demand-response routing finding (H-4, FR30), surfaced and routed by Almond. A solar meter
    // on a demand-charge schedule that is not already enrolled is a candidate: demand-response programs
    // pay growers for the evening curtailment solar cannot cover. DISPLAY-ONLY in v1 (nothing is
    // actually enrolled). The dollar is HONEST-BLANK: the codebase carries no published DR program-rate
    // table, so we name the opportunity, never a figure (NFR12). Plain operator English, no exclamation
    // marks, no em dashes.
    demandResponse: {
      // Names the meter; says DR pays for the evening curtailment solar misses. No dollar, no pitch.
      situation: (meter: string): string =>
        `${meter} carries a demand charge that solar does not cover, because the peak is set in the evening when the panels are nearly off. A demand-response program would pay you for curtailing then, which you may already be doing.`,
      // The honest-blank dollar: no published program rate is on file, so no figure is quoted.
      note: "We cannot put a dollar on this yet, since the program rate is not on file. It is worth looking into with PG&E.",
      action: (): string => "Look into demand response",
    },
    // The Calendar lens (D-2, FR12/FR13/FR15, UX-DR5): the true-up heartbeat. A twelve-month rolling
    // grid placing each meter's and array's true-up month, with the next-upcoming pulled out above the
    // grid in plain words so the grower never does date math. The per-entry credit dollar is
    // honest-blank until a statement is uploaded (the upload affordance is wired in G-3), so this lens
    // carries STRUCTURE and TIMING only - never a fabricated true-up dollar. A persistent calm note
    // states the monthly-reconciliation truth for aggregation meters (FR15). Plain operator English,
    // no clock-precise dates, no exclamation marks, no em dashes.
    calendar: {
      // The accessible name for the lens region.
      heading: "True-up calendar",
      // The next-upcoming pull-out lead, in plain words ("Next true-up: December, 6 meters, about 6
      // weeks out"). monthsAhead is whole months (0 = settling this month); the lead never shows raw
      // date math. month is 1-12.
      nextLabel: "Next true-up",
      nextLine: (month: number, meterCount: number, monthsAhead: number): string => {
        const name = MONTHS[month - 1] ?? "";
        const meters = meterCount === 1 ? "1 meter" : `${meterCount} meters`;
        let when: string;
        if (monthsAhead <= 0) when = "settling this month";
        else if (monthsAhead === 1) when = "about 4 weeks out";
        else if (monthsAhead === 2) when = "about 6 weeks out";
        else when = `about ${monthsAhead} months out`;
        return `${name}, ${meters}, ${when}`;
      },
      // Shown above the grid when no solar meter has a true-up month on file (honest absence).
      nextNone: "No true-up dates on file yet",
      // One month cell: the month name (1-12) and the count of meters (and arrays) settling that month.
      monthName: (month: number): string => MONTHS[month - 1] ?? "",
      // The settling counts inside a populated cell, said in plain words. A cell with no settle reads
      // calm and empty (no fabricated zero count). Arrays are named separately so aggregation is legible.
      cellMeters: (n: number): string => (n === 1 ? "1 meter" : `${n} meters`),
      cellArrays: (n: number): string => (n === 1 ? "1 array" : `${n} arrays`),
      // The credit dollar per cell is honest-blank until a statement settles it (the upload path is
      // wired in G-3). This label names the absence calmly beside a populated cell.
      creditLabel: "Credit",
      // The persistent monthly-reconciliation note for aggregation meters (FR15). Plain truth: an
      // aggregation account reconciles its meters' credits monthly as well as settling once a year.
      monthlyNote:
        "Aggregation meters reconcile their credits monthly, then settle once a year at the true-up.",
      // The empty state when no solar meter (or array) has a true-up month on file at all.
      empty: "No true-up months on file yet",
      // Accessible label for a populated month cell, naming the month and its settling counts as
      // content so a screen reader reads the heartbeat, never an empty cell it skips.
      cellAria: (month: number, meterCount: number, arrayCount: number): string => {
        const name = MONTHS[month - 1] ?? "";
        const meters = meterCount === 1 ? "1 meter" : `${meterCount} meters`;
        if (arrayCount === 0) return `${name}: ${meters} settling`;
        const arrays = arrayCount === 1 ? "1 array" : `${arrayCount} arrays`;
        return `${name}: ${meters} and ${arrays} settling`;
      },
    },
    // Almond's solar legibility words (H-1, FR29). The read-tool shapes carry the SAME solar facts the
    // Solar tab renders, said in plain operator English so the model quotes them verbatim rather than
    // paraphrasing a number. Every phrase here describes STRUCTURE or TIMING already on file - never a
    // net-metering credit dollar (the credit stays honest-blank, named by `honestBlank` above, and
    // Almond points to the upload path in H-2). No exclamation marks, no em dashes.
    almond: {
      // The program meaning Almond states for a meter's net-metering token. The generic NEM2 token has
      // no granular program on file (A-4 is data-gated to the generic token at launch), so Almond says
      // the generic program and that the granular code is not on file - never a guessed NEM2-family code.
      programGeneric: "on NEM2 net metering",
      programGranular: (code: string): string => `on the ${code} net-metering program`,
      programNotOnFile: "with no net-metering program on file",
      // Array membership said in plain words. A single array is "credited by", several read as a count.
      arrayMembership: (count: number): string =>
        count === 1 ? "credited by 1 solar array" : `credited by ${count} solar arrays`,
      arrayNone: "not linked to any solar array yet",
      // The usage-proportional share of an array (C-2), said as a whole percent (never a credit dollar).
      sharePercent: (pct: number): string => `about ${pct}% of that array's credits by usage`,
      shareNotOnFile: "no usage on file to compute a share",
      // The grandfather position (FR16, data-gated on the interconnection date DM1, not on file at
      // launch): Almond says it is not on file rather than estimating a vintage or an expiry.
      grandfatherNotOnFile: "its interconnection date is not on file, so its grandfather position is not known",
      // The demand-charge reality (E-1/E-2, FR21/FR23): solar does not lower the demand charge, said
      // honestly. The dollar is the demand charge already PRINTED on the bill, never a net-metering
      // credit; the uncovered share is a percentage of the bill, never a credit multiplied from a share.
      demandReality: (demandUsd: string): string =>
        `solar does not lower its demand charge of about ${demandUsd}, which is set in the evening when the panels are nearly off`,
      demandRealityWithShare: (demandUsd: string, uncoveredPct: number): string =>
        `solar does not lower its demand charge of about ${demandUsd}, about ${uncoveredPct}% of the bill solar does not cover, set in the evening when the panels are nearly off`,
      demandNotOnFile: "its demand-charge reality is not on file yet",
      // The net-metering credit honest-blank (H-2, FR31). A true-up credit is a dollar Terra cannot
      // trace to a real statement, so Almond states it as not on file rather than inventing a number,
      // and names the upload path (FR37) the grower can use to settle it. NEVER a credit figure.
      creditNotOnFile: "its true-up credit is not on file yet",
      // The plain way to fill the gap (FR37): upload the true-up statement on the Solar tab to settle
      // the credit. Stated only as the path Almond points to, never as a sales pitch.
      creditUploadPath:
        "to see the credit, upload the true-up statement on the Solar tab and it will settle",
    },
  },

  // The rebuilt dashboard: a ranked feed of moves, with charts one tap down. Plain
  // operator English, real names, no em dashes. Dollars are the largest thing on screen.
  dashboard: {
    // Persistent badge when the screen is showing the representative seed, not a live pull.
    badge: "Representative data",
    badgeNote:
      "Batth-shaped sample data, every figure traced through the rate engine. Connect a PG&E account to replace it with live numbers.",
    back: "Back",
    toAllMeters: "All meters",
    recheck: "Recheck for savings",
    settings: "Settings",

    home: {
      eyebrow: "Rates and billing",
      // The one plain line at the top, summarizing the headline.
      status: (findings: number, save: number, risk: number): string => {
        if (findings === 0) return "Nothing needs your attention this cycle. We keep watching your bills.";
        const parts: string[] = [];
        if (save > 0) parts.push(`about ${usd(save)} a year to save by fixing rates`);
        if (risk > 0) parts.push(`${usd(risk)} at risk on a recent bill`);
        const tail = parts.length ? `: ${joinNames(parts)}.` : ".";
        return `We found ${findings === 1 ? "1 thing" : `${findings} things`} worth money on your meters${tail}`;
      },
      saveLabel: "You can save",
      riskLabel: "At risk now",
      perYear: "a year",
      saveSub: (count: number): string =>
        count === 0
          ? "No rate savings found yet. We keep checking as bills come in."
          : `${count} ${count === 1 ? "meter is" : "meters are"} on a costlier rate than they need.`,
      riskSub: (count: number): string =>
        count === 0
          ? "Nothing flagged on a recent bill."
          : `${count} ${count === 1 ? "thing" : "things"} to check on a recent bill.`,
      // Three glance numbers.
      glanceSpend: "Spend this cycle",
      glanceElectric: "Electric used",
      glanceWater: "Water pumped",
      estimate: "est",
      waterNote: "Estimated from pump size and run time",
      noTrend: "first cycle",
      trendUp: (pct: number): string => `up ${pct}% vs last cycle`,
      trendDown: (pct: number): string => `down ${pct}% vs last cycle`,
      trendFlat: "about the same as last cycle",
      // The feed.
      feedTitle: "What to do",
      feedNote: "Sorted by what matters most. Tap any card for the evidence.",
      noFindings: "No findings yet. As your bills come in, anything worth money lands here.",
      hierarchyTitle: "Your operation",
      hierarchyNote: (entities: number, accounts: number, meters: number): string =>
        `${meters} meters across ${accounts} PG&E accounts and ${entities} legal entities.`,
      browseFarm: "Browse by ranch and meter",
    },

    // A recommendation card in the feed and the tag on it.
    feed: {
      tagSave: "Save",
      tagRisk: "At risk",
      tagWatch: "Worth a look",
      tagInfo: "Heads up",
      perYear: "a year",
      onceLabel: "one time",
      open: "See the evidence",
      done: "Mark done",
      notNow: "Not now",
      saving: "Saving...",
      // Honest stub: v1 displays, the agent acts later.
      stubNote: "Terra files this for you once the agent is live. For now, tap to see the proof.",
    },

    // The recommendation detail view.
    detail: {
      evidenceTitle: "The evidence",
      meterLabel: "Meter",
      rateLabel: "Rate",
      accountLabel: "Account",
      ranchLabel: "Ranch",
      cycleLabel: "Billing cycle",
      whatWeFound: "What we found",
      beforeAfterTitle: "What that one peak cost",
      beforeLabel: "This cycle's demand charge",
      afterLabel: "What it would have been",
      beforeAfterNote: (avoid: number): string =>
        `One mistimed start set the peak for the whole cycle. Holding it to your normal level would have cut about ${usd(avoid)} from this bill.`,
      dailyPeaksTitle: "Daily peak demand, this cycle",
      dailyPeaksNote: "The tall bar is the day that set the charge.",
      billAuditChartNote: "The red bar is the bill that looks high.",
      chartTitle: "The numbers behind this",
      noChart: "No interval history on this meter yet, so there is no chart to show.",
      backToFeed: "Back to the feed",
    },

    // Drill-down levels.
    drill: {
      farmTitle: "Your operation",
      entitiesTitle: "Legal entities",
      accountsTitle: "PG&E accounts",
      ranchesTitle: "Ranches",
      metersTitle: "Meters",
      entityLabel: "Entity",
      accountLabel: "Account",
      ranchLabel: "Ranch",
      meterTitle: "Meter",
      spendLabel: "Spend, last 12 cycles",
      usageLabel: "Electric, last 12 cycles",
      cycleSpendLabel: "Latest cycle",
      rateFirst: "Rate",
      meterCount: (n: number): string => (n === 1 ? "1 meter" : `${n} meters`),
      accountCount: (n: number): string => (n === 1 ? "1 account" : `${n} accounts`),
      ranchCount: (n: number): string => (n === 1 ? "1 ranch" : `${n} ranches`),
      noMeters: "No meters here yet.",
      noEntities: "No legal entities on file. Import your meter list to map accounts to entities.",
      unassigned: "Unassigned",
      unassignedNote: "Not yet mapped to a legal entity. Your meter list fills this in.",
      pageOf: (page: number, total: number): string => `Page ${page} of ${total}`,
      prev: "Previous",
      next: "Next",
      hp: (hp: number): string => `${num(hp)} hp`,
      gpm: (gpm: number): string => `${num(gpm)} gpm`,
      solar: (kw: number): string => `${num(kw)} kW solar`,
      trueUp: (month: string): string => `True-up in ${month}`,
      servesRanch: (names: string): string => `Waters ${names}`,
      noMeteredHistory:
        "No 15-minute interval history on this meter yet, so the demand breakdown is not available.",
      openMeter: "Open meter",
      demandBreakdownTitle: "Peak, partial-peak and off-peak demand",
      partialPeakNote: "Partial-peak is not modeled on this rate yet, so it reads as zero.",
      spendOverTimeTitle: "Spend over time",
      usageOverTimeTitle: "Electric usage over time",
    },

    // Honest loading / empty / error states.
    state: {
      loading: "Reading your meters...",
      loadingBills: "Pulling your bills...",
      empty: "Nothing to show here yet.",
      errorTitle: "We hit a snag",
      errorBody: "Something went wrong loading this. Your data is safe. Try again.",
      retry: "Try again",
      notConnectedTitle: "No account connected",
      notConnectedBody:
        "Connect a PG&E account and Terra reads every meter, rate, and bill, then finds the money in them.",
      notConnectedCta: "Connect PG&E",
    },
  },

  // The Meters demand-risk board. PG&E bills a demand charge on each meter's single highest
  // 15-minute draw of the billing cycle, separately per meter. The board makes the gap between
  // a meter's current draw and its own highest point so far (its "ceiling") obvious, and warns
  // when that gap closes. Plain operator English: "highest point so far this cycle", never "kW
  // peak" jargon where it can be avoided.
  meters: {
    title: "Meters",
    // The representative-data marking (consistent with the app's other demo surfaces).
    representativeTag: "Representative data",
    // The freshness line. Interval data lags about a day, so we never call a draw "live".
    asOf: (phrase: string): string => `Latest meter reads from ${phrase}`,
    asOfShort: (phrase: string): string => `as of ${phrase}`,

    // The "do I need to pay attention?" copy, shared by the side rail: the all-clear title and
    // the daily-read eyebrow.
    top: {
      allClearTitle: "Nothing needs attention",
      readEyebrow: "Today's read",
    },

    // The side rail: compact "Most urgent" + "Today's read" stat cards.
    side: {
      label: "At a glance",
      urgentEyebrow: "Most urgent",
      // The dollar consequence if the most urgent meter beats its own highest point.
      urgentAmount: (amount: string): string => `${amount} at risk`,
      atRiskLabel: "at risk",
    },

    // Group containers.
    group: {
      // A group is organizational, never a billing unit: it shows a summed dollar roll-up + a
      // meter count, never a pooled kW (demand is per meter).
      meterCount: (n: number): string => (n === 1 ? "1 meter" : `${n} meters`),
      collapse: "Collapse",
      expand: "Expand",
      moveTo: "Move to group",
      newGroup: "New group name",
      rename: "Rename group",
      edit: "Edit group",
      doneEditing: "Done editing",
      cancel: "Cancel",
      resetGroups: "Reset grouping",
      resetGroupsHint: "Undo your manual group changes.",
    },

    // A single meter tile.
    tile: {
      currentDraw: "Drawing now",
      peakSoFar: "Highest this cycle",
      headroom: "Room left",
      overPeak: "Over its highest point",
      // The timestamp that rides every current-draw figure (the ~1-day lag, made honest).
      drawAsOf: (phrase: string): string => `reading from ${phrase}`,
      kindPump: "Pump",
      kindWell: "Well",
      kindShop: "Shop",
      openDetail: "Open meter",
    },

    // The meter detail view.
    detail: {
      back: "Back to meters",
      curveTitle: "Today's draw, every 15 minutes",
      ceilingLabel: "Highest point this cycle (the demand ceiling)",
      nowLabel: "Latest reading",
      chargeTitle: "This cycle's demand charge",
      // What set the charge, in plain English.
      chargeSet: (amount: string, kw: string, time: string): string =>
        `${amount}. Set by the highest 15-minute draw so far this cycle: about ${kw} around ${time}.`,
      chargeRate: (perKw: string): string => `Priced at ${perKw} per kW on this meter's rate.`,
      // Stagger advice is ONLY ever shown when overlapping loads share ONE meter.
      sameMeterNote:
        "This is one meter. Spreading its own overlapping runs apart lowers its single highest draw. Pumps on separate meters running at once do not stack into one demand charge.",
      crossMeterNote:
        "Demand is billed per meter. Running this meter at the same time as another meter has no effect on either meter's demand charge.",
      noData: "We could not find this meter.",
    },

    // Axis + chart labels.
    chart: {
      kwAxis: "kW",
      timeAxis: "Time of day",
      ceiling: "Ceiling",
      now: "Now",
    },
  },

  onboarding: {
    connect: {
      title: "Connect your power use",
      intro:
        "Terra reads your PG&E meter history to spot where running a pump spikes your bill. Connect once and every Terra tool can use it.",
      // The real PG&E connect: live account through our secure utility connection.
      pgeCta: "Connect my PG&E account",
      pgeNote:
        "Sign in to PG&E once and Terra pulls every meter, rate, and bill on the account. Your login goes straight to our secure utility connection, never to Terra.",
      pgeStarting: "Opening the secure sign in...",
      pgeFormHint:
        "Sign in to PG&E above. You may be asked for a text-message code. Your password stays with the utility connection, we never see it.",
      pgeClose: "Close",
      pgeOpenHosted: "Form not loading? Open the secure sign-in page",
      pgeHostedCta: "Open PG&E sign-in",
      pgeHostedNote:
        "We open PG&E's secure sign-in in a new tab. Sign in there, then come back to this tab. We will be pulling your meters and bills.",
      resumeNote: "You have a PG&E connection in progress.",
      resumeCta: "Resume",
      pgeError:
        "We could not start the connection. Try again, or explore with sample data below.",
      // Grower-controlled bulk upload: a real PG&E Green Button export.
      uploadTitle: "Upload your PG&E data export",
      uploadNote:
        "Download your usage history from PG&E (the Green Button export) and drop the file here. One export can carry every account and meter at once, so this is the way to load a whole operation. You can add several files if you exported one per account.",
      uploadHint:
        "On pge.com: Energy Usage Details, then Green Button, then Download my data, saved as XML.",
      uploadField: "PG&E export files (.xml)",
      uploadCta: "Upload and read",
      uploadWorking: "Reading your export...",
      // Master meter list: the grower's own spreadsheet (the whole-farm inventory).
      sheetTitle: "Import your meter list",
      sheetNote:
        "Have a spreadsheet of all your meters? Save it as CSV and drop it here. We read every account, entity, rate, and serial code, so the whole operation shows up at once, even meters no single PG&E login can see.",
      sheetHint:
        "Columns we read: entity, account, service id, meter, rate, serial code, location, gpm, nem, true-up. Anything extra is ignored.",
      sheetField: "Meter list (.csv)",
      sheetCta: "Import meter list",
      sheetWorking: "Reading your meter list...",
      // Demo / offline fallback.
      sampleDataCta: "Explore with sample data",
      sampleCta: "Connect PG&E",
      sampleNote: "Pulls your meter history straight from PG&E Share My Data.",
      bayouCta: "Connect Bayou",
      bayouNote: "Pulls your accounts, meters, and bills through Bayou. Uses live sandbox data so you can watch the whole thing work end to end.",
      working: "Reading your meters...",
      fallbackHeading: "No account handy right now?",
      billTitle: "Snap a photo of a bill",
      billNote: "We read the meter number, rate, and billing cycle off it.",
      billCta: "Read the bill",
      billFilled: "We read these off your bill. Fix anything that looks wrong.",
      manualTitle: "Or type it in",
      manualNote: "Anything off a recent PG&E bill works.",
      manualCta: "Add this pump",
      farmNameLabel: "Farm name",
      fieldName: "What do you call this pump?",
      fieldServiceId: "Service ID",
      fieldMeterSerial: "Meter number",
      fieldRate: "Rate",
      fieldCycle: "Billing cycle code",
      fieldLocation: "Where it is",
    },

    classify: {
      pump: "Looks like an irrigation pump. A big load that runs hard in summer.",
      nonPump:
        "Looks like an office or shop. A small, steady load all year, not a pump.",
      unsure: "We are not sure about this one. Take a look.",
      overridden: "You set this one yourself.",
    },

    confirm: {
      eyebrow: "Review",
      title: "Does this look right?",
      intro: (count: number): string =>
        count === 1
          ? "We found 1 meter on your account. Name it, say what it waters, and drag the pin to the real spot."
          : `We found ${count} meters on your account. Name them, say what each one waters, and drag the pins to the real spots.`,
      farmNameLabel: "Farm name",
      meterNameLabel: "What do you call this?",
      kindPump: "Pump",
      kindNonPump: "Not a pump",
      kindHelp:
        "Not a pump means the office, shop, or house. Terra leaves those out of pump advice.",
      servesLabel: "What it waters",
      noFieldsYet: "No fields yet. Add one below to tag your pumps.",
      fieldsTitle: "Your fields",
      metersTitle: "Your meters",
      addBlock: "Add a field",
      blockNameLabel: "Field name",
      blockAcresLabel: "Acres",
      blockCropLabel: "Crop",
      removeBlock: "Remove",
      addPump: "Add a pump by hand",
      addPumpNote: "For a diesel or gas pump that PG&E does not meter.",
      newPumpNameLabel: "Pump name",
      newPumpPowerLabel: "Runs on",
      newPumpHpLabel: "Horsepower",
      powerDiesel: "Diesel",
      powerGas: "Gas",
      unnamedPump: "Pump",
      unnamedNewPump: "New pump",
      mapTitle: "Where your pumps are",
      mapHelp: "Drag each pin to its real spot. Tap a pin, then use the arrow keys to nudge it.",
      save: "Looks good, save it",
      saving: "Saving...",
    },

    pending: {
      eyebrow: "Connecting to PG&E",
      title: "Pulling your data",
      intro:
        "PG&E is sending over your meters, bills, and usage. This can take a few minutes. You can leave this page and come back, we will keep going.",
      stepSignIn: "Signing in to PG&E",
      stepBills: "Pulling your bills",
      stepUsage: "Pulling your usage history",
      waiting: "Hang tight, this usually takes a couple of minutes.",
      slow: "Still working. A first pull can take longer, sometimes a few hours. You can leave and come back, your data will be here.",
      importing: "Got it. Loading your data...",
      error: "We hit a snag reading your data. Your connection is saved, you can try again.",
      retry: "Back to connect",
      startOver: "Connect a different account",
      // Live bill-parse progress.
      billsProgress: (usable: number, total: number): string =>
        `${usable.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} bills read`,
      billsUnparsed: (n: number): string =>
        n === 1
          ? "1 bill could not be read yet. The utility connection is looking into it."
          : `${n.toLocaleString("en-US")} bills could not be read yet. The utility connection is looking into them.`,
      continueReady: "Continue with what's ready",
      continueNote:
        "Show my meters and bills now. Usage history keeps loading in the background.",
      continuing: "Loading your data...",
    },

    connected: {
      eyebrow: "Connected to PG&E",
      title: "Here is what we pulled",
      intro: (meters: number, bills: number): string =>
        `${meters === 1 ? "1 electric meter" : `${meters} electric meters`} and ${
          bills === 1 ? "1 bill" : `${bills} bills`
        } came back from your account. This is your real data flowing through Terra.`,
      accountLabel: "PG&E account",
      saIdLabel: "Service ID (SA ID)",
      serialLabel: "Meter number",
      rateLabel: "Rate",
      fuelLabel: "Type",
      billsTitle: "Bills pulled",
      billsRange: (count: number, low: string, high: string): string =>
        `${count} billing cycles, ${low} to ${high} per month`,
      cycleNoTotal: "no total on file",
      gasNote: (n: number): string =>
        n === 1
          ? "1 gas meter was found and carried, but not billed. Terra optimizes electric demand charges, so gas is set aside for now."
          : `${n} gas meters were found and carried, but not billed. Terra optimizes electric demand charges, so gas is set aside for now.`,
      empty: "No electric meters came back. Check the connection and try again.",
      cta: "Go to Pump Timing",
    },

    done: {
      title: (farmName: string): string => `${farmName} is set up.`,
      summary: (pumps: number, fields: number): string =>
        `${pumps === 1 ? "1 pump" : `${pumps} pumps`} connected across ${
          fields === 1 ? "1 field" : `${fields} fields`
        }. Terra will start watching your demand charges.`,
      cta: "Go to Pump Timing",
    },

    error: {
      title: "That did not go through",
      body: "Something went wrong saving that step. Your power data is safe. Try again, or start over.",
      retry: "Try again",
      startOver: "Start over",
    },

    index: {
      eyebrow: "Pump Timing",
      summary: (pumps: number, fields: number): string =>
        `Watching ${pumps === 1 ? "1 pump" : `${pumps} pumps`} across ${
          fields === 1 ? "1 field" : `${fields} fields`
        }.`,
      body: "Your timing advice lands here as your bills come in.",
      reonboard: "Connect a different account",
    },

    // The rebuilt flow: one hook, a calm reveal of the data assembling itself, the
    // single biggest finding, then a minimal save. Connecting is the only required step.
    reveal: {
      // Screen 1, the hook.
      hookHeadline: "See what your power is actually costing you.",
      hookCta: "Connect PG&E",
      hookStarting: "Opening the secure sign in...",
      hookQuiet:
        "We cannot see anything until you connect, and you can disconnect anytime.",
      resume: "Resume your connection",
      // Screen 3, the reveal. Each line fades in as its number lands.
      connected: "Connected to PG&E",
      signingIn: "Signing in to PG&E",
      accountsFound: (n: number): string =>
        n === 1 ? "1 account found" : `${n} accounts found`,
      metersWord: (n: number): string => (n === 1 ? "meter" : "meters"),
      billsPulled: "Bills pulled",
      billsProgress: (usable: number, total: number): string =>
        `${usable.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} bills read`,
      gasNote: (n: number): string =>
        n === 1 ? "1 gas meter set aside" : `${n} gas meters set aside`,
      badgeSandbox: "Sandbox account",
      badgeSample: "Sample data",
      badgeSampleFinding: "Sample finding",
      slow: "Still pulling. A first connection can take longer. You can leave and come back, your data will be here.",
      continueReady: "Continue with what's ready",
      error:
        "We hit a snag reading your data. Your connection is saved, you can try again.",
      retry: "Back to connect",
      // Screen 4, the finding.
      findingKicker: "Your biggest finding",
      perYear: "a year",
      noFinding:
        "Your account is connected. As your bills come in, anything worth money lands here.",
      findingCta: "Looks good, save my farm",
      // Screen 5, the save.
      saveTitle: "Save your farm",
      saveNote:
        "Add your name and email so we can reach you about what we find. No password needed.",
      nameLabel: "Your name",
      namePlaceholder: "Full name",
      emailLabel: "Email",
      emailPlaceholder: "you@farm.com",
      saveCta: "Save and open Terra",
      saving: "Saving...",
    },

    // The relocated optional imports: Green Button, CSV, sample, manual, and a link to
    // edit farm details. None required; the live PG&E connection already powers Terra.
    settings: {
      link: "Settings",
      title: "Connections and data",
      intro:
        "Add more data sources or edit your farm details. None of this is required. Your PG&E connection already powers Terra.",
      editFarmTitle: "Edit farm details",
      editFarmNote: "Name your pumps, tag the fields they water, and place the map pins.",
      editFarmCta: "Edit farm details",
      back: "Back to Pump Timing",
    },
  },

  // Parcels GIS: the full-screen land-mapping surface. Original Terra copy only; no third-party
  // brand names or wording. Plain operator English, no exclamation marks, no em dashes.
  parcelsGis: {
    searchPlaceholder: "Search by address, APN, or coordinates",
    // Search resolution notes (shown in the dropdown under the search pill).
    search: {
      noParcel: "No parcel found at that spot.",
      badCoord: "Enter a latitude between -90 and 90 and a longitude between -180 and 180.",
      noApn: "No parcel found for that APN. APN search currently covers Fresno County.",
      noAddress: "No match for that address in the Central Valley.",
      error: "Search is unavailable right now. Try again.",
    },
    // Viewport streaming status (a small pill over the map).
    status: {
      zoomIn: "Zoom in to see parcel boundaries",
      loading: "Loading parcels",
      dense: "Dense area. Zoom in for every parcel.",
      error: "Couldn't load parcels here",
    },
    // The farmer's own blocks panel (replaces the for-sale listings). Hybrid: a "Blocks" tab of the
    // farmer's own land (ops data), plus a "Market" tab of nearby comparable land values.
    blocks: {
      title: "Your blocks",
      close: "Close panel",
      info: "Your mapped blocks",
      empty: "No blocks loaded yet.",
      acresLabel: "ac",
      colorByLabel: "Color by",
      searchHint: "Search to jump anywhere in the Central Valley.",
      tabBlocks: "Blocks",
      tabMarket: "Market",
      marketNote: "Recent comparable land values near your blocks.",
      owned: "Owned",
      leased: "Leased",
      count: (n: number): string => `${n} ${n === 1 ? "block" : "blocks"}`,
    },
    // The right-side "farm at a glance" card.
    summaryCard: {
      county: (county: string): string => `${county} County`,
      close: "Close summary",
      acres: "Acres",
      blocks: "Blocks",
      leased: "Leased",
      attention: "Need a look",
      cropMix: "Crop mix",
    },
    listings: {
      title: "Your blocks",
      close: "Close listings",
      info: "About listings",
      breadcrumb: "Batth Farms / Fresno County",
      tabAll: "All",
      tabSaved: "Saved",
      filters: "Filters",
      save: "Save listing",
      available: "Available",
      pending: "Pending",
      perAcre: "/ac",
      acresLabel: "acres",
    },
    // Top toolbar tool tooltips.
    tools: {
      select: "Select",
      addPoint: "Add point",
      measureWalk: "Walk a boundary",
      history: "History",
      drawRectangle: "Draw a rectangle",
      drawLine: "Draw a line",
      dropPin: "Drop a pin",
      text: "Add a label",
      duplicate: "Duplicate shape",
      ruler: "Measure distance",
      area: "Measure area",
      export: "Export view",
    },
    right: {
      newMap: "New Map",
      insights: "Insights",
      export: "Export",
      banner: "Select land to get started.",
      dismissBanner: "Dismiss",
      close: "Close panel",
      breadcrumb: "Home / California",
      heading: "California",
      // Two short paragraphs of original Terra-voice copy. Words wrapped in [[...]] render
      // as green inline links in the panel.
      bodyOne:
        "California works more farmland than any other state, spread across [[58 counties]] and a patchwork of water districts. Terra pulls the public parcel record for each one, so ownership, acreage, and zoning sit in a single view.",
      bodyTwo:
        "Click any parcel to open its land record, or draw a boundary to measure acreage on the spot. Saved parcels and [[recent sales]] follow you into every county you work.",
      allCounties: "All California Counties",
      comparePlans: "Compare Plans",
    },
    controls: {
      threeD: "3D",
      layers: "Layers",
      zoomIn: "Zoom in",
      zoomOut: "Zoom out",
      fsa: "FSA",
      parcel: "Parcel",
      home: "My farm",
    },
  },

  // Energy demand visuals (Feature A): the intra-day load curve that makes one expensive
  // 15-minute window visible, and the concrete fix with the new number. No em dashes.
  spike: {
    sectionTitle: "Demand spike",
    intro:
      "One short window set this whole month's demand charge. Here is the day it happened.",
    // The peak window callout: time of day + the dollars that window set.
    windowSet: (time: string, amount: string): string =>
      `${time} set ${amount} of demand charge`,
    peakAtLabel: "Peak demand",
    peakKw: (kw: string): string => `${kw} kW`,
    curveAria: "Intra-day load curve for the peak day, fifteen-minute readings",
    yAxisLabel: "kW",
    representativeNote:
      "Representative shape from this meter's billed peak. The peak kW and the demand charge are the real billed figures.",
    // Cause + fix lines.
    causeOverlap: "Several pumps ran at the same time and stacked into one peak.",
    causePeakWindow: "One run set the peak inside the 5 to 8pm price window.",
    fixLabel: "The fix",
    overlapPumpsNote:
      "Representative split across this meter's pumps. The combined peak and the charge are billed figures.",
    // The before/after dollar line: "$X now to about $Y, save about $Z".
    delta: (now: string, after: string, save: string): string =>
      `${now} now to about ${after}, save about ${save}`,
    nowLabel: "This cycle's demand charge",
    afterLabel: "After the fix",
    saveLabel: "You keep",
    newPeakLabel: "New peak",
    // The headline demand-share stat (Feature C), proving demand is not rate x usage.
    shareLabel: "Demand charges",
    sharePercent: (pct: number): string => `${pct}%`,
    shareCaption: "of your PG&E bill is the demand charge",
    shareAria: (pct: number): string =>
      `Demand charges are about ${pct} percent of your total PG&E bill`,
  },

  // The "Show meter" proof layer (Feature B): the meter's own shape, then the same usage
  // priced under two rates so the saving is not a claim, it is arithmetic.
  proof: {
    sectionTitle: "Why this rate",
    shapeTitle: "This meter's pattern",
    shapeIntro: "How this pump draws power over a representative day.",
    trendTitle: "Peak demand by month",
    trendIntro: "The highest fifteen-minute demand each billing cycle.",
    compareTitle: "Same usage, two rates",
    compareIntro:
      "We took this cycle's exact usage and priced it on both rates. Same kilowatt-hours, same peak, different cost.",
    currentColumn: (schedule: string): string => `Now: ${schedule}`,
    recommendedColumn: (schedule: string): string => `Recommended: ${schedule}`,
    energyRow: "Energy",
    demandRow: "Demand",
    customerRow: "Service charge",
    totalRow: "Total this cycle",
    saving: (amount: string): string => `Saves ${amount} on this cycle`,
    noSaving: "This cycle does not favor a switch.",
    billedNote: "Current column is your printed bill total.",
    modelNote: (delta: string): string =>
      `Our model of the current rate is within ${delta} of the printed bill.`,
    aria: "Side by side bill comparison, current rate versus recommended rate",
  },

  // Misclassification refund (Feature D): a pump billed on a commercial rate it was never
  // eligible for. Framed as money that may be owed, never a promised payout.
  refund: {
    findingTitle: "Wrong rate class, refund may be owed",
    situation: (tariff: string): string =>
      `This meter runs like an irrigation pump but is billed on ${tariff}, a commercial rate. That looks like a billing-class error.`,
    action: "Ask PG&E to review the rate class and back-bill the difference",
    impactNote: (amount: string): string => `Up to ${amount} may be recoverable`,
    rule:
      "Under PG&E Rule 17.1 a billing-class error can be corrected for past cycles, capped at 36 months.",
    upTo: (amount: string): string => `Up to ${amount}`,
  },
} as const;

export type CopyTree = typeof en;
