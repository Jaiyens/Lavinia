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
  // Sign-in (Epic 5, Story 5.1). No passwords: Google SSO or an emailed magic link.
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
    error: "That did not work. Try again.",
    signOut: "Sign out",
    tourPrompt: "Just want to look around first?",
    // The magic-link email itself (Story 5.1, real sender). Plain operator English.
    email: {
      subject: "Your Terra sign-in link",
      heading: "Sign in to Terra",
      body: "Tap the button below to sign in. This link works once and expires in 24 hours.",
      button: "Sign in to Terra",
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
    link: "Tour a sample",
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
    },
  },
  // The account / profile page (signed-in operator's own details + connected sources).
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
    signOut: "Sign out",
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
    agents: {
      home: "Home",
      energy: "Energy",
      parcels: "Parcels",
      water: "Water",
    },
    comingTag: "Coming",
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
      // Panel header.
      name: "Almond",
      tagline: "Your farm assistant",
      // Composer.
      placeholder: "Ask anything about your farm",
      send: "Send",
      // States.
      greeting: (farmName: string): string =>
        `I can answer questions about ${farmName}. Ask me about a meter, your rates, or where the money is going.`,
      thinking: "Thinking",
      streaming: "Almond is answering",
      error: "That did not work.",
      retry: "Try again",
      // Accessible label for the live conversation region.
      conversationLabel: "Conversation with Almond",
      // Starter questions shown on the empty chat, drawn from the farm so the grower is
      // never staring at a blank box. `biggestOpportunity` only shows when there are findings.
      startersLabel: "Try asking",
      starters: {
        biggestOpportunity: "What is my biggest opportunity to save money?",
        costliestMeters: "Which meters cost me the most?",
        wrongRate: "Are any of my meters on the wrong rate?",
        dataCompleteness: "How complete is my billing data?",
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
    },
    // The finding card (situation + one action + dollars + severity + one-tap response).
    findings: {
      // Fallback action line when a stored action cannot be read; never a blank.
      actionFallback: "Review this finding",
      // One-tap responses: record the grower's call, never execute anything.
      respondDone: "Done",
      respondDismiss: "Not now",
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
        legacy: "Legacy",
        cost: "This cycle",
        demand: "Demand charge",
        status: "Status",
        coverage: "Coverage",
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
      // A null inventory field (ranch / entity / status / rate not on file). Never fabricated.
      emptyShort: "—",
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
    },
    // The filter bar (Story 2.6): narrow the whole dashboard to an entity / ranch / rate.
    // A dimension with no values on this farm renders no control.
    filter: {
      entity: "Entity",
      ranch: "Ranch",
      rate: "Rate",
      allEntities: "All entities",
      allRanches: "All ranches",
      allRates: "All rates",
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
      trueUp: "True-up month",
      nameplate: "Array size",
      nameplateValue: (kw: string): string => `${kw} kW`,
      arrays: "Arrays crediting this meter",
      arrayUnnamed: "Array",
      allocation: "Credit allocation",
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
    // Left nav rail items (icon + label).
    nav: {
      baseMaps: "Base Maps",
      listings: "Listings",
      soldLand: "Sold Land",
      mortgage: "Mortgage",
      insights: "Insights",
      layers: "Layers",
      portfolio: "Portfolio",
      account: "Your account",
    },
    searchPlaceholder: "Search parcels",
    listings: {
      title: "Listings",
      close: "Close listings",
      info: "About listings",
      breadcrumb: "Home / Plat Map / California",
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
    },
  },
} as const;

export type CopyTree = typeof en;
