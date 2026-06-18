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
    stat: {
      meters: "Meters",
      attention: "Need attention",
      savings: "Savings found",
      allClear: "All clear",
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
    agents: {
      home: "Home",
      energy: "Energy",
      water: "Water",
      labor: "Labor",
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
          },
          // The one-line preview Almond states before the file lands ("a lightweight preview, NOT an
          // approval gate"): how many meters, which table, and any filter applied. Singular/plural is
          // handled so one meter reads naturally. The filter clause is appended only when set.
          preview: (count: number, kind: string, filter: string | null): string => {
            const meterWord = count === 1 ? "meter" : "meters";
            const where = filter ? ` ${filter}` : "";
            return `I will export your ${count} ${meterWord}${where} as a ${kind} spreadsheet.`;
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
            // Download button / link label.
            download: "Download spreadsheet",
            // Accessible label for the download control (names the file).
            downloadAria: (fileName: string): string => `Download ${fileName}`,
            // Shown when the file was kept in the grower's Reports (owner-only persistence, Story
            // 8.6), so they know it is safe to fetch again later. Absent for an unsaved export.
            savedToReports: "Saved to your Reports",
          },
          // Inline failure the panel renders when generation fails (typed, never a raw throw, never a
          // partial file). Calm operator English, offers a retry path by re-asking.
          error: "I could not build that spreadsheet. Ask me to try it again.",
          // Honest empty case: a filter (or an empty farm) left no meters to export, so there is no
          // file to make. Never an empty download.
          empty: "No meters match that, so there is nothing to export.",
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
      moverLabel: "Biggest mover",
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
      peakNote: (kw: string): string => `Set a ${kw} kW peak this cycle`,
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
} as const;

export type CopyTree = typeof en;
