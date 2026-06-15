# Terra Tool 1: PG&E Energy Dashboard Rebuild

## Read first, then plan
Before writing any code, read CLAUDE.md at the repo root, then locate the pieces we are keeping: the shared data model (Farm, Entity, Account, Pump, Crop, Person, Connection, Recommendation), the Bayou client and normalizer, the rate engine, and the current dashboard and onboarding routes. Keep the repo, the data model, the Bayou client, and the rate engine as they are. We are rebuilding the dashboard UI on top of them and wiring it to real Batth data.

Stack for reference: Next.js App Router, TypeScript, Tailwind, Prisma, SQLite, single repo, deployed on Vercel.

Produce a plan before building. Inventory what exists, list every file you will add or change, flag anything in the repo that conflicts with this spec, and call out any place where real Batth data is not yet wired so we decide how to handle it together. Stop and wait for my approval. After I approve, run the whole thing end to end.

## What this is
Terra is an AI-native operating system for farms. Tool 1 is a PG&E energy dashboard for large California ag operations. The first customer is Batth Farms, run by Gagan: roughly 183 meters across multiple legal entities, accounts, ranches, and crops (almonds, pistachios, wine grapes, raisins), on a mix of PG&E rate schedules (HAGC, AG5B, HAGA2, AG4B, and others), with NEM2 solar aggregation across several true-up dates.

The value for Batth is rate optimization and billing clarity. Their almond irrigation runs continuously in off-peak hours with no scheduling slack, so pump staggering does not apply here. The dollars come from putting meters on the right rate schedules, catching billing errors, surfacing demand-charge exposure, and managing solar true-up.

The incumbent we are replacing is Wexus, which is effectively a human energy engineer wrapped in a SaaS UI. We deliver the same meter-level visibility, rate optimization, and bill auditing as pure software, and an AI agent replaces the human energy engineer over time. From Wexus, keep three things and fix the rest. Keep the three top-line glance numbers, the peak / partial-peak / off-peak demand breakdown, and the ranch-to-equipment drill-down. Fix the rest: their app is a wall of charts that never tells the farmer what to do, their single most valuable number (potential savings) is buried at the bottom of a tab, their cost calculator is a manual worksheet, they ship "coming soon" placeholders, and the whole thing is dated, dark, and noisy.

The current Terra dashboard is broken and we are replacing it: bad UI, invented well names, fabricated per-meter dollar figures, and a Bayou-to-PG&E connection that was never finished, so the data on screen is synthetic. This rebuild fixes the UI and grounds everything in real Batth data.

## The one rule that governs everything
The home screen is a ranked feed of moves. Charts live one level down, on drill-in. Competitors show the farm. Terra runs it. So the first thing Gagan sees is money and the move to make, with the evidence and the charts a tap away.

Render Recommendations as the primary object of the home screen. Use the existing Recommendation grammar already in the data model: situation, action, impactUsd, severity, status, and the executable-action hook. The rate engine produces the findings; map them into this grammar and render them as a ranked feed sorted by severity and dollar impact. The executable-action hook stays stubbed in v1 (the AI agent acts later), so action buttons are honest about what they do for now.

## Real data, zero fabrication
The synthetic-data problem is the reason we are here. It must not repeat.

No invented well or meter names. Use real names from Batth's data, like "PUMP # 17." No fabricated dollar figures: every number on screen traces to real meter data through Bayou and the rate engine. Build against the real normalized Bayou data shape so real PG&E data plugs in with no UI changes. Where a connection is not yet wired, show a plain empty or "not connected" state that points to the fix. Never stand in fake numbers. If you use a test fixture anywhere (for example the Speculoos fixture), label it clearly as a fixture in the UI and in code so it can never be mistaken for live data.

## Design system
Calm, light, one accent. Take the restraint of Linear and Stripe and run it in our light palette. Hierarchy comes from type weight, size, spacing, and opacity, with color used sparingly.

Palette:
- Paper background #FAF9F4, ink #16190F, green #2fa84f as the single accent.
- Green is the only accent color and it always means something: a savings number, a primary action, an active state.
- Red is reserved for money at risk right now (a demand-charge hit, an over-charge). Pick a deep, accessible red and use it nowhere else.
- Derive all grays from ink at opacities for hierarchy. Recede the navigation and chrome so the content area takes precedence.

Type:
- Inter throughout: display, body, and data (loaded via next/font).
- Tabular numerals on all data and figures so columns of numbers align.
- Carry hierarchy with weight and size (hero figure, section title, card title, body, label), not with multiple typefaces. Generous whitespace.

Tokens and components:
- Put colors, fonts, spacing, and radii into the Tailwind config and CSS variables so Tool 2 through Tool 6 inherit the look for free. No hardcoded hex or pixel values scattered in components.
- Cards are disciplined containers, one idea per card. Separate them with spacing and a faint surface lift. Avoid heavy borders, loud shadows, and boxing every element.
- Watch the failure mode of light-and-airy layouts going flat: the type scale and whitespace have to do the work, so be deliberate.

## Information architecture
Home screen, top to bottom:
- One plain-English line summarizing the headline status or finding.
- Two hero figures: money you can save (green) and money at risk right now (red), both counting up on load.
- Three glance numbers with trend arrows versus last cycle (this is the kept Wexus pattern, reframed): total spend this cycle, electric usage, water usage.
- The ranked Recommendation feed. Each card shows one plain sentence (the situation), the dollar impact in mono colored by save versus at-risk, a severity tag, the recommended move in plain English, and a primary action (stubbed honestly for v1). Tapping a card opens its detail.

Recommendation detail:
- The evidence: which meter, which rate schedule, which date or interval, what the rate engine found.
- For demand-charge findings, the before/after bill-shrink visual described below.
- The charts relevant to that finding, one time frame per view.

Drill-down navigation, on the real Batth hierarchy:
- Farm to Entity/Account to Ranch to Pump/Meter, using real names at every level.
- At each level show the relevant spend and usage, and promote the rate schedule to a first-class fact, since rate optimization is the wedge. Show the PG&E rate code with a plain-English gloss next to it.
- Charts live here, on drill-in: the peak / partial-peak / off-peak demand breakdown, spend over time, and usage. Use sparklines and trend on summaries and the full chart on expand.

The agent replaces the manual cost calculator. Do not build per-set hour dropdowns or a "use yesterday's schedule" button. The rate engine computes findings and the feed surfaces them.

## Recommendation categories for v1
All rate-engine-driven, all grounded in real Batth data, all figures real:
- Rate-schedule optimization: a meter or account on a schedule that costs more than the best-fit schedule for its load profile. Show the move and the estimated annual saving.
- Demand-charge exposure: a single 15-minute peak-draw interval that drove, or is on track to drive, a full-cycle demand charge. A demand charge is set by one peak interval in the cycle, so one mistimed pump start can trigger a full month's charge. Show the date and interval and the dollar hit, with the before/after.
- Bill audit: a charge that does not match the rate schedule or the expected usage for the cycle.
- NEM2 solar and true-up: an approaching true-up date, over- or under-generation against the aggregation, or banked credits at risk.

## Comprehension rules (a farmer in the cab of a truck)
- Plain words and real names everywhere: "PUMP # 17," "your July bill," "you'll pay about $3,000." No internal codes. Show a rate code only with a plain-English gloss beside it.
- Every screen opens with one plain sentence answering "what changed and what it means for you" before any chart.
- One time frame per view. Do not put a daily chart next to a monthly one.
- Trend arrows and direction over decimal precision. Round to whole dollars in headlines.
- Mobile first: single column, large tap targets (44px and up), the hero number readable at arm's length in direct sun. All text and key UI meet WCAG AA contrast on the paper background. Verify home and a recommendation detail at a narrow mobile width and at desktop width.
- No em dashes in any UI copy. Use colons and short sentences.

## Animation (functional only)
Every animation confirms an action, communicates status, guides attention, or shows what just happened. Cut anything decorative. Timing 200 to 500ms, eased (ease-out for entrances, ease-in-out for transitions), consistent across the app. Honor prefers-reduced-motion: when set, skip the motion and render the final state immediately.

The moments that matter here:
- Money count-ups: the save and at-risk hero figures tick up from zero on load.
- Before/after bill shrink: opening a demand-charge recommendation animates the bar collapsing from the penalty height down to actual usage (think the $3,000+ mistimed bar dropping to about $200). This single transition is the pitch.
- Drill transitions: Farm to Ranch to Pump as one continuous motion so the user keeps their place in the hierarchy.
- New-recommendation pulse: a quiet pulse on a freshly surfaced card, no popup.
- Honest loading: skeleton placeholders and a calm spinner while Bayou data loads. Never show fabricated numbers as a stand-in while it pulls.

## Engineering notes
- Reuse the data model and the Recommendation grammar exactly. Do not redefine them. Render Recommendations from rate-engine output mapped into the grammar.
- Keep the Bayou client, normalizer, and rate engine. Wire the dashboard to real Batth data through them. Meter keying on (farmId, serviceId) with SA ID as the stable identifier. Gas meters stay in the normalized shape and are not promoted to Pumps in v1.
- Loading, empty, and error states for every data-backed view. If a connection is missing, say so plainly and point to the fix.
- Virtualize or paginate long meter lists (Batth has about 183) so the UI stays fast.
- Accessibility: semantic markup, visible focus states, AA contrast, reduced-motion support.
- Keep it fast: lean rendering, minimal client state.

## Do not
- Ship any "coming soon" panel. If a feature is not built, leave it off the screen.
- Rebuild the manual cost calculator: no per-set hour dropdowns, no "use yesterday's schedule."
- Use dark saturated chrome or more than one accent color. Green is the only accent; red is reserved for money at risk.
- Fabricate well names or dollar figures. Everything traces to real meter data or is labeled as a fixture.
- Crowd the home screen with charts. Charts live on drill-in.
- Restart the repo or rebuild the data model, Bayou client, or rate engine.

## Definition of done
- Home renders the ranked Recommendation feed from real Batth data, with save and at-risk hero figures that count up, and three glance numbers with trend arrows.
- Recommendations use the existing grammar, sorted by severity and dollar impact. Each opens to a detail view with real evidence, and demand-charge findings include the before/after bill-shrink visual.
- Drill-down works on the real Batth hierarchy (entities to accounts to ranches to pumps/meters) with real names, and the rate schedule is shown as a first-class fact at each level.
- Charts live on drill-in, one time frame per view, with the peak / partial-peak / off-peak demand breakdown available.
- Design tokens are in place: the calm light palette with one green accent and reserved red, and Inter throughout with tabular numerals for data.
- Plain-language copy and real names throughout, rate codes only with a gloss, no em dashes in UI copy.
- Mobile and desktop both work, AA contrast met, reduced-motion respected, loading and empty and error states present.
- No placeholders, no manual calculator, no fabricated data.