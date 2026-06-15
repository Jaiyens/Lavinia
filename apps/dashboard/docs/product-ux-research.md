# Terra Product & UX Research: B2B Dashboard Patterns, Agentic AI Interfaces, and Competitor Teardown

## TL;DR
- **Build Tool 1 as a Stripe/Linear-grade "energy ontology" dashboard**: KPI summary cards at top (total spend, demand-charge exposure, biggest mover), a fast filterable/sortable table of all pumps/meters, stacked bar charts that split usage into peak/partial-peak/off-peak by PG&E tariff, and traffic-light color coding (green/amber/red) so a non-technical grower sees "good/watch/bad" in milliseconds. Wexus — the most direct Tool 1 competitor — already validates this exact four-page structure (Dashboard / Pump Status map / Data Export / Savings Plan); Terra should match its feature set but beat it decisively on design polish, speed, and the agentic layer Wexus lacks.
- **Design the "Brain" as a propose-then-approve agent, not an autopilot**: surface the agent's reasoning, a concrete proposed action ("shift Pump 14 irrigation to after 9pm, saves ~$340 this week"), and a one-tap Approve/Edit/Reject — modeled on Palantir AIP's "agents create proposals, humans approve via Actions" pattern and the pre-execution-approval / escalation-trigger patterns now standard in production agents. Pair it with a Linear/Raycast-style ⌘K command palette for natural-language actions.
- **The competitive white space is unification + energy + agentic control**: no competitor combines (a) PG&E demand-charge/energy management, (b) a true agentic LLM operating layer, and (c) computer-vision field data into one operating system. Wexus owns energy but has no agent and a thin UI; Orchard Robotics owns vision + "Canary" agent ambitions but not energy/spend; Semios/FBN/Syngenta have data and chatbots but no demand-charge engine. Terra should borrow Wexus's energy features, Palantir's ontology+Actions model, Orchard's "OS on top of data" framing, and Linear/Stripe's visual bar.

---

## Key Findings

1. **The best B2B dashboards lead with a small number of summary KPI cards, then progressively disclose detail.** Stripe's Home shows business charts "at a glance" then links into Payments, Payouts, Disputes, Balance; its model is KPI cards (total revenue, total transactions, average order value, pending) → analytics charts → a searchable/sortable transaction table → a side-panel drill-down for any single row. This card→chart→table→drawer hierarchy is the single most replicable pattern for Terra's Tool 1.

2. **Color should encode meaning, not decoration.** The observability world (Grafana, Datadog) is explicit: use Stat/single-value panels with traffic-light thresholds (green=good, amber=noteworthy, red=bad) for the top-level "is there a problem?" question, and reserve time-series line/bar charts for the drill-down. Grafana supports absolute and percentage thresholds that recolor the value, background, or line as data crosses them. Color-coded highlighting of "concerning values" in tables is standard in finance dashboards.

3. **Tables are a first-class visualization, not a fallback.** Stripe pre-aggregates messy raw data (cents→dollars, Unix→dates, stitched subscription state) into clean fact/dimension tables upstream so every dashboard "answers the next question without a new query." For Terra's hundreds of meters, the equivalent is a pre-modeled "meter/pump" entity with normalized cost, demand, efficiency, and rate-plan fields.

4. **Palantir's "ontology" is the strategic model for unifying fragmented farm data.** Foundry maps messy source data to real-world objects ("Pump," "Ranch," "Meter," "Crew") with relationships and business logic, so both humans and AI agents reason over "Which rigs are down right now and who's responsible?" in natural language. Actions provide a permissioned "control plane" where AI agents are sandboxed and "rather than directly make changes, AI agents create proposals" for human approval. This is precisely the architecture Terra's "Palantir for agriculture" positioning implies.

5. **Production agentic UX has converged on "propose → approve → execute → verify."** Across AWS Bedrock Agents, LangGraph, Mastra, and academic reviews, the dominant safe pattern is: non-destructive reads run automatically; consequential/irreversible/financial writes are gated by explicit human confirmation before side effects; escalation triggers halt the agent on risk signals or low confidence. Best-practice UX: make the ask concrete ("Delete user john@example.com?" not "Tool execution requires approval"), summarize context (don't dump raw JSON), and support an approval queue when actions stack up.

6. **Command palettes (Linear/Raycast/Superhuman) are the proven fast path to natural-language action.** ⌘K opens a keyboard-accessible palette to jump anywhere or run commands ("Move issue to next cycle," "Assign to teammate"). Linear's broader design language — an "inverted-L" chrome (sidebar + main view), an 8px spacing scale, Inter typeface, Radix UI components, high-contrast light/dark themes, and modular components instead of a rigid grid — is the concrete recipe behind the "Linear quality bar."

7. **Wexus is the direct Tool 1 competitor and a feature blueprint.** Its platform is organized into four pages — an overall Dashboard (energy/water/cost over year/month/day/hour), a Pump Status map (real-time meter status by end-use), a CSV Data Export page, and a Savings Plan page (tracks $/kWh/kW savings + utility-program links). It disaggregates cost to the meter/pump, runs a Utility Rate Analysis recommending the cheapest eligible rate plan, sends SMS alerts up to 90 minutes before peak/demand charges, automates SGMA water reporting, and has an Irrigation Cost Calculator forecasting weekly costs from ET + rate plan + pump specs. Pricing is a quote-based "per meter, per month" model in three mix-and-match tiers (Starter=monthly, Professional=daily, Enterprise=real-time). Crucially, Wexus has no agentic/LLM layer and a dated UI — Terra's opening.

8. **Orchard Robotics is the most direct overall competitor and shares Terra's "OS on top of data" thesis.** Its FruitScope Vision (tractor-mounted cameras, 1–12 mph), FruitScope Vault (system of record), FruitScope OS (decisions for pruning/thinning/spray/irrigation/harvest), and the forthcoming **Canary** agentic decision module map almost 1:1 onto Terra's "Eyes and Ears + Brain." CEO Charlie Wu told TechCrunch (Sept 3, 2025) the ambition is to "collect the data, then build an operating system on top of the data, and then eventually own all the workflows in the farm" — the same land-grab Terra is running. Orchard raised a $22M Series A in September 2025 (led by Quiet Capital and Shine Capital, with General Catalyst and Contrary participating), bringing total raised to more than $25M.

---

## PART 1 — B2B SaaS Dashboard & Data-Display UI Patterns

### Company-by-company patterns

**Stripe (financial data clarity).** KPI cards summarize "overall payment performance at a glance" (total revenue, total transactions, average order value, pending). Below them: dedicated analytics reports with toggles (e.g. revenue vs orders) and CSV export; a searchable, sortable transaction table (ID, date, amount); and a **side panel** that opens full detail for any row without leaving context. Stripe Sigma adds SQL for power users and a natural-language "Sigma Assistant." Lesson for Terra: most growers live in the card+table layer; expose an "advanced/SQL-like" path only as progressive disclosure.

**Palantir Foundry/Gotham/AIP (complex data made simple).** The Ontology turns tables/columns into business objects ("Pump," "Meter," "Ranch") with relationships and logic; out-of-the-box apps (Object Explorer, Workshop low-code app builder, Quiver) consume the ontology natively. The Scenario primitive enables sandboxed "what-if" branches. For non-technical users, the win cited repeatedly is that "non-technical people pick it up" and build operational apps themselves. Terra should model an explicit farm ontology as its data foundation.

**Linear (minimalist speed).** Inverted-L chrome (persistent sidebar + content view); list/board toggles; saved filtered views pinned to the sidebar; ⌘K command palette; keyboard-first; 8px spacing scale, Inter font, Radix components, modular (non-grid) layout, high-contrast dark/light themes. Linear's own dashboard guidance: build each dashboard for one clear purpose with an owner; pair every key metric with a simple this-week/last-week/trailing-high-low chart so "anyone could instantly see if something was good, bad, or in line." Use modular insights as charts, tables, or single-number metrics.

**Ramp / Brex (spend visualization & alerting).** Real-time spend graphs, vendor/category breakdowns, ML anomaly detection that flags duplicate/overpriced/out-of-policy spend, and real-time alerts tied to policy enforcement (admin notified immediately on a violation). Multi-entity dashboards roll up many sub-accounts into one view — directly analogous to rolling up hundreds of meters across many ranches. Ramp auto-codes line items and surfaces "cost-saving opportunities automatically"; this proactive-savings framing is exactly what Terra's energy agent should do for demand charges.

**Grafana / Datadog (time-series & alerting).** Panels in a grid; Stat panels with traffic-light thresholds for "big board" status; time-series graphs for trends; gauges for percentages; heatmaps for distributions; tables for leaderboards/inventories. Alerting state machine: Normal → Pending (condition met, awaiting duration) → Firing → resolved, with grouping (avoid alert storms), silencing (maintenance windows), and routing by severity/label. Best practice: don't put raw graphs in the high-level overview — use Stat + color so the answer comes "in milliseconds."

**Salesforce / Looker / Tableau / Snowflake (BI).** Strategic vs operational vs tactical dashboard types; F-/Z-pattern scanning layouts; drill-downs, filters, hover-to-expand; restraint over decoration ("a great dashboard is invisible"). Choose chart types to fit the data, not the mood board: bar for category comparison, line for trends over time, tables for multi-variable comparison.

**Notion / Airtable / Retool (flexible views & building blocks).** Multiple views over the same data (list/board/calendar/gallery), and composable dashboard building blocks. For Terra, the takeaway is letting a grower flip the same meter dataset between a map view, a table view, and a cost-trend view.

### Actionable UI/UX principles for Terra

- **KPI cards first.** 3–5 cards: Total monthly energy spend, Demand-charge exposure this cycle, Biggest cost mover (pump/ranch), Projected month-end bill, Savings captured YTD. Each card pairs a number with a sparkline and a vs-last-period delta in green/red.
- **One table to rule the meters.** A dense, sortable, filterable table of every pump/meter: name, ranch, rate plan, this-cycle cost, peak kW (demand), efficiency, status. Color-code concerning values; click a row → side drawer with that meter's full dashboard (mirrors Stripe + Wexus's "More" drill-in).
- **Stacked bars by TOU period.** Split energy bars into peak / partial-peak / off-peak per PG&E tariff (Wexus does exactly this) so growers literally see expensive afternoon usage.
- **Traffic-light semantics everywhere.** Green/amber/red on cards, table cells, and the map; reserve line charts for drill-down trends.
- **Map view of meters.** Geotagged pumps with on/off + status overlays (Wexus pattern), since growers think spatially in ranches and blocks.
- **Progressive disclosure.** Default to the simple card+map+table; tuck rate-analysis detail, CSV export, and SQL-like queries behind secondary navigation.
- **Alerting as a first-class object** with a Normal→Pending→Firing lifecycle, grouped to avoid storms, routed by severity, and silenceable during known maintenance.
- **Typography & layout:** Inter or similar, tabular figures for numeric columns, 8px spacing scale, persistent sidebar chrome, dark/light parity — the Linear recipe.

---

## PART 2 — Agentic AI & Conversational Interfaces

### Integration patterns (where the agent lives)
- **Sidebar/panel copilot** (Microsoft Copilot, CopilotKit `CopilotSidebar`): assistant alongside the dashboard; good default for Terra's Brain so the data stays visible.
- **Command palette** (Linear/Raycast/Superhuman ⌘K): fast natural-language actions ("show Pump 14 cost last 30 days," "shift irrigation off-peak").
- **Inline / embedded** (GitHub Copilot, "dive deeper into a chart"): contextual suggestions where the data is.
- **Full-page / immersive chat** (ChatGPT/Claude/Perplexity): for open-ended exploration; "the more important the task, the more real estate."
- **Multi-pane chat + canvas** (Notion AI, Replit): chat in one pane, an evolving working canvas (agent-generated UI/"dynamic blocks") in another — strong for data-heavy planning.
- **Generative UI / agent-driven app** (CopilotKit AG-UI): agent renders real components into the native UI; "feels like a built-in product feature rather than a conversation."

### Trust, transparency & control patterns
- **Propose-then-commit.** Agent proposes a tool call and **waits for approval before any side effect**; approvals recorded before execution; idempotency keys prevent double-execution on retries. (Industry consensus across Bedrock, LangGraph, Mastra.)
- **Three oversight placements** (from the agent literature): pre-execution approval (confirm before every consequential action), post-execution review (act, then surface for inspection), and escalation triggers (run autonomously until a risk signal — sensitive data, irreversible op, low confidence — forces a halt). Terra should default money/operations actions to pre-execution approval.
- **Approval vs clarification** (Mastra): "approval" is a yes/no gate for risky actions; "suspension" pauses to collect missing input. Make the ask concrete and human-readable, not raw JSON.
- **Governor/provisional UI** (Microsoft/Figr): agent-proposed changes appear at partial opacity until approved — a clean way to show "the agent did X, pending your OK."
- **Reasoning visibility** (Palantir AIP "Get Session Trace"): expose the sequence of steps/the agent's reasoning for debugging and trust. FBN's "Norm" deliberately positions itself as advisor-not-actor — FBN Head of Data Science Kit Barron told AgFunderNews "Norm is not a replacement for agronomy advice... We don't want to mess around when it comes to animal health or crop protection" — reflecting how cautious ag users are.
- **Audit trails** as part of the loop: every request/approval/denial logged and reviewable (also Palantir's per-action logging for humans and agents).
- **Guardrails as policy** (Palantir Actions control plane; permit.io): delegate "what needs approval" to a versioned policy/permission layer, not hardcoded rules — this is literally "acts on it within your control."

### How Palantir AIP layers agents on the ontology
Agents are built in AIP (Chatbot Studio/AIP Logic, no/low/pro-code), grounded in the Ontology (RAG, tools, Actions), evaluated with AIP Evals, and embedded into Workshop apps where they **create staged proposals for human review** before ontology edits apply. Automate can "automate the application or staging of ontology edits for human review" with the logic behind each proposed action inspectable. This is the reference design for Terra's Brain: ontology + tools + Actions + propose/approve + full observability.

### Actionable principles for Terra's Brain
1. Default to **advisor + proposer**, not autopilot; gate every irrigation/spray/spend action behind one-tap **Approve / Edit / Reject**.
2. Make every proposal **concrete and quantified**: action + projected $ impact + confidence + the data it used.
3. Show **"the agent did X" with provisional styling** and a reasoning trace on demand.
4. Ship a **⌘K command palette** for natural-language actions; keep a persistent sidebar copilot so data stays visible.
5. Enforce **guardrails as editable policy** ("never shut a pump during an active irrigation set," "auto-approve savings actions under $X").
6. Maintain an **audit log + approval queue**; group notifications to avoid alert storms (Grafana lesson).
7. Use **generative/dynamic UI blocks** (charts, tables) inside chat responses rather than walls of text — essential for non-technical growers.

---

## PART 3 — Competitor Product & Feature Teardown

### Group A — Energy / ops & farm-management software

**Wexus Technologies (highest-priority Tool 1 competitor).**
- *Features:* Four-page app — **Dashboard** (energy/water/cost on yearly/monthly/daily/hourly, stacked by peak/partial-peak/off-peak; year-over-year comparison), **Pump Status map** (geotagged meters with real-time on/off, efficiency rating, $/acre-foot cost intensity, rate plan per meter), **Data Export** ("My Bills," multi-year CSV for electric/gas/water), **Savings Plan** (tracks $/kWh/kW saved + links to IOU rebate programs; includes Utility Rate Analysis recommending the cheapest eligible rate plan). Plus an **Irrigation Cost Calculator** (daily/weekly views forecasting cost from ET + rate plan + pump specs), a **Solar ROI Dashboard** (actual-vs-would-have-been bills, production vs consumption), and automated monthly/mid-month email reports. The CEC final report documents named screens (Dashboard, Pump Efficiency & Health, Equipment Status Map, Rate Analysis, Cost Calculator, etc.) and four user personas (General Manager, Ranch Manager, Accountant, Sustainability Manager) the UI was designed around.
- *Alerts:* email, in-app, and SMS; peak/demand-charge warnings up to **90 minutes** in advance per pump. Per CEO Chris Terrell, "the platform tracks anomalies in real time by sifting through mountains of data every 15 minutes and gives alerts if it finds one... the system will flag an energy spike from the grid and alerts customers to an outage or pump motor failure." Pumps can be remotely shut off (with hardware).
- *Compliance:* automated SGMA/SB88 water reporting via energy-to-water conversion ("turns an energy meter into a water meter").
- *Pricing:* quote-based **per-meter, per-month**, three mix-and-match tiers — Starter (monthly), Professional (daily), Enterprise (real-time, needs IoT hardware). No public dollar figures. Per CEO Chris Terrell, Wexus "pioneered" a PG&E program under which "farmers can get up to $100,000 financing per irrigation pump for efficiency upgrades and sensors with interest free terms for up to five years with no money down."
- *Savings claims (treat as promotional):* an unnamed Central Coast grower cited "40% (+$40,000) in annual energy costs on just one irrigation pump" via rate analysis; Jackson Family Wines: "over 19,200 kWh," "over $9,000," and "140 kW in power demand reduction." **Epistemic flag:** the CEC pilot's independently modeled (UC Davis CWEE) savings were **not statistically significant** after adjustment, versus 17.2% unadjusted — so the headline "up to 40–50%" figures are marketing, not audited averages.
- *What Terra should borrow:* the entire energy feature set (TOU-stacked charts, per-meter disaggregation, rate analysis, 90-min peak alerts, cost calculator, SGMA export, solar ROI) — but deliver it at Linear/Stripe quality and wrap it in the agent Wexus lacks (e.g., "I can move these 6 pumps off-peak and save $1,240 this week — approve?").

**Semios (precision-ag-as-a-service for permanent crops).** In-canopy IoT sensors per acre; modules for pest (variable-rate pheromone mating disruption, camera traps, degree-day forecasting), disease, frost (10-min inversion monitoring, wet-bulb, sprinkler thresholds; integrates Altrac wind-machine/pump/valve control), and irrigation (daily water-balance dashboard tracking weather/ET/precip/applied water; soil-moisture; remote pump/valve control; Infiltration Map). Owns **Agworld** (field planning/scheduling/budgeting/recordkeeping) and has consolidated acquisitions "under one login." Automated email/text alerts. ~$60/acre/yr base; frost module ~$10/acre/yr. *Borrow:* the "one login, one dashboard, full-service field team" consolidation story and the irrigation water-balance dashboard.

**CropX (soil/irrigation analytics).** Soil sensors (moisture/temp/EC/salinity at depths), ET sensors, weather stations; FMS suite for irrigation scheduling, disease risk, nutrient leaching, salinity. Markets "so clear you don't even need agronomic expertise." 20,000+ users, 70+ countries. Syngenta integration. *Borrow:* the "no agronomic expertise required" clarity bar and sensor-to-recommendation pipeline.

**Climate FieldView (Bayer) / Cropwise (Syngenta).** Cropwise is a digital FMS (satellite imagery, weather, sensors, analytics) monitoring 70M+ hectares; opened to third-party developers as an "open platform." **Cropwise AI** is a GenAI advisor (multilingual conversational LLM) built on the Cropwise Insight Engine (20+ yrs weather, 80,000+ growth-stage observations). At its Sept 29, 2024 launch (World AgriTech Innovation Summit, London), Syngenta CIDO Feroz Sheikh said its seed recommendation models help growers "increase yields by up to 5 percent"; the roadmap includes computer-vision pest/disease detection. *Borrow:* the open-platform/ecosystem play and the conversational-LLM-on-proprietary-agronomic-models pattern (directly relevant to Terra's Brain).

**John Deere Operations Center (default farm-ops cloud).** Field/boundary/guidance setup; machine connectivity (JDLink, telemetry every 5–30s: location, speed, fuel, engine status, diagnostic trouble codes); remote display access/control; flags for field obstacles; yield/variety/tillage/speed maps; **Yield Documentation – Specialty Crop** (weight-based/conveyor harvest docs for HVC growers, block-level → tree-level variability); prescription maps; bundled shareable reports; a "Connections" marketplace of trusted-advisor software. *Borrow:* the connectivity/telemetry model, the "Connections" partner ecosystem, and report-sharing with advisors. *Gap to exploit:* Deere is iron-centric and weak on specialty-crop energy/spend and agentic decisions.

**FBN "Norm" (LLM agronomy advisor).** Built on OpenAI GPT-3.5; pulls public data (weather, soil, labels, university research) + FBN proprietary feeds; answers agronomy/chemical/seed/livestock questions; conversational form factor matches how growers already text advisors. Now a **suite of personas** (Norm the Agronomist, Dr. Diane the Livestock Vet, etc.) drawing on farmer-provided equipment/yield/grain/input data; explicitly **advisor-not-actor** for liability reasons. Free to FBN's member base, which the company said in July 2025 had "grown to over 117,000 member farms (representing about 187 million acres)," announced alongside $50M in new AI funding. *Borrow:* the persona framing and "first-line advisor" positioning; *differentiate* by making Terra's agent actually **take approved actions** (Norm only advises).

**Ag labor/workforce software.**
- **PickTrace:** workforce/harvest management for large farms; real-time field labor tracking, badge-scan check-in via dedicated devices, scheduling, a proprietary **Wage Engine** (piece-rate, breaks, OT/DT, gross payroll), H-2A/direct/contract worker management, an **audit timeline** highlighting errors; integrates Famous/Datatech payroll; per-acre pricing.
- **HeavyConnect:** digital timekeeping with **automatic error-checking** (flags labor-law issues as "tips"), individual/group piece-rate, food-safety/training/traceability; "dashboard as a control hub" to view/edit timecards in real time and export to any payroll.
- **Seso:** H-2A filing/compliance software + HR/payroll/onboarding.
- *Borrow:* the audit-timeline/error-flagging UX and piece-rate payroll model for Terra's eventual labor module — and note these are acquisition/integration targets for "unifying fragmented farm data."

### Group B — Ag computer vision & vision-and-ops landscape

**Orchard Robotics (most direct overall competitor).** FruitScope Vision (tractor/ATV-mounted AI cameras, 1–12 mph, per-tree/vine/plant data, on-device overnight processing → next-morning data), FruitScope Vault (system of record), FruitScope OS (decisions across pruning/thinning/spray/irrigation/labor/harvest), and **Canary** (forthcoming agentic AI trained on "the largest datasets in the world for the crops we manage" to "automate & optimize farm decision-making"). Serves apple/grape/blueberry/cherry/almond/pistachio/citrus — the same Central Valley specialty crops as Terra. Per-acre/year pricing, large-acre discounts. $22M Series A (Sept 2025, led by Quiet Capital and Shine Capital), >$25M total. *This is Terra's mirror image from the vision side* — Terra's edge must be energy/spend + the broader operational ontology, not just crop vision.

**Aerobotics.** **TrueFruit** smartphone app (iPhone Pro, 1mm-accuracy fruit sizing from 10mm; **TrueFruit Grade** adds color/blemish grading), drone scan (multispectral/thermal, tree-level + zonal maps, irrigation-uniformity), and crop-insurance-ready tree counts/canopy data. Drone metrics AI-generate representative sample points to guide app users. *Borrow:* the mobile-first, "can't press the wrong button" field-data-capture UX and insurance-ready reporting.

**Bloomfield Robotics (Kubota).** FLASH stereo camera mounts to a (Kubota) tractor, captures plant-by-plant HD images, analyzes via cloud deep-learning for yield/maturity/disease. Kubota-backed. *Relevant as the OEM-aligned vision competitor.*

**Green Atlas Cartographer.** ATV/SxS/Burro-mounted LiDAR (300,000 pts/sec) + high-res strobe cameras (works in any light), maps flowers/fruit/weeds/pests and canopy geometry per tree; scans 15 acres/hr (faster in nuts), next-morning results; **Detail Driven** platform with a map UI (locate on mobile/tablet/tractor cab), GPS-enabled maps distributed to field staff, equipment-ready outputs for precision spray/thin/prune; fruit counts "typically within 5%"; data exportable in open formats. *Borrow:* "equipment-ready outputs, no manual interpretation step" and the in-cab map UX; available via innov8.ag seasonal lease.

**Robotics platforms (software/data angle).**
- **Carbon Robotics:** LaserWeeder + **Carbon AI / Large Plant Model** (150M+ labeled plant images); a "dead-simple interface" where farmers scroll captured field photos and tag what to keep/kill, and the robot "learns instantly" (no 24-hr retraining); 100+ farms, 15 countries. *Borrow:* the real-time human-in-the-loop labeling UX as a model for fast operator feedback.
- **Bonsai Robotics:** VisionSteer autonomy + **fleet-management interface** (view location/path of all vehicles, "go back in time" to see prior-day work); **Teletrace**/Topcon CL-55 CAN-bus telemetry (chemical applications, fuel efficiency, obstructions) for **mixed-brand ("rainbow") specialty-crop fleets**; "simple and intuitive app and data center." *Borrow:* the rainbow-fleet telemetry unification — directly relevant to Terra unifying heterogeneous farm equipment.
- **Verdant Robotics:** multi-action RaaS (weed/fertilize/treat simultaneously, sub-mm accuracy) collecting per-plant data for real-time decisions.
- **Burro:** autonomous carts; serves as a mobile platform other sensors (e.g., Green Atlas) ride on.

### Prioritized features Terra should adopt

**For Tool 1 (near-term PG&E energy dashboard):**
1. **KPI summary cards** (spend, demand-charge exposure, biggest mover, projected bill, savings YTD) with sparklines + deltas — *Stripe/Ramp.*
2. **Per-meter/pump table** with sort/filter/color-coded cells → **side-drawer drill-down** — *Stripe + Wexus.*
3. **TOU-stacked bar charts** (peak/partial-peak/off-peak) + year-over-year compare — *Wexus.*
4. **Utility Rate Analysis** recommending the cheapest eligible PG&E schedule (AG-A1/A2/B/C, with awareness of AG-C's summer peak demand charge and $0.50/kWh demand-charge limiter) — *Wexus.*
5. **Demand-charge tracking** to the 15-min interval + **90-minute peak/demand SMS alerts** with a Normal→Pending→Firing lifecycle, grouped/silenceable — *Wexus + Grafana/Datadog.*
6. **Meter map view** with geotagged on/off status — *Wexus.*
7. **Irrigation Cost Calculator** (ET + rate + pump specs) and **Solar ROI** views — *Wexus.*
8. **One-click SGMA/CSV export** — *Wexus.*
9. **Traffic-light color system + Stat panels** for instant good/watch/bad — *Grafana/Datadog.*
10. **Linear-grade craft:** ⌘K palette, persistent sidebar, 8px scale, Inter/tabular numerals, dark/light parity, sub-second navigation.

**For the longer-term agentic farm OS (the Brain + Eyes/Ears):**
1. **A farm ontology** ("Pump," "Meter," "Ranch," "Block," "Crew," "Crop") as the unifying data model — *Palantir Foundry.*
2. **Agents that create proposals, humans approve via an Actions control plane** — *Palantir AIP.*
3. **Propose→approve→execute→verify** with pre-execution approval for money/ops actions, escalation triggers, idempotency, and audit logging — *Bedrock/LangGraph/Mastra consensus.*
4. **Guardrails as editable policy** ("acts within your control") — *Palantir Actions / permit.io.*
5. **Reasoning trace + provisional ("the agent did X") UI** — *AIP session trace / Microsoft governor pattern.*
6. **Conversational advisor personas grounded in proprietary data** — *FBN Norm / Cropwise AI* — but upgraded to take approved actions.
7. **"OS on top of the data, then own the workflows"** sequencing — *Orchard Robotics.*
8. **Mixed-brand fleet/equipment telemetry unification** — *Bonsai Teletrace / John Deere Connections.*
9. **Mobile-first, error-proof field capture** + **real-time human-in-the-loop labeling** — *Aerobotics / Carbon Robotics.*
10. **Open-platform/partner ecosystem** so third parties extend Terra — *Cropwise Open Platform / Deere Operations Center Connections.*

---

## Recommendations (staged)

**Stage 1 — Ship Tool 1 to a Wexus-beating bar.** Implement the 10 Tool-1 features above. The benchmark that matters: a non-technical ranch manager should answer "which pumps are costing me too much and why?" in under 10 seconds from the home screen, and a CFO should export an SGMA/cost report in one click. If growers still call Wexus's account managers for rate analysis, Terra's automated rate-analysis isn't clear enough yet.

**Stage 2 — Introduce the Brain as a read-only advisor, then a proposer.** First ship natural-language Q&A over the energy ontology (⌘K + sidebar). Only once trust is established, enable **proposals with one-tap approval** for the highest-ROI, lowest-risk action: shifting irrigation off-peak to cut demand charges.

**Stage 3 — Expand the ontology and actions** to spray scheduling, labor, and vision data (Eyes/Ears), adding equipment telemetry unification and an open partner ecosystem.

---

## Caveats
- **Wexus savings figures are promotional, not audited.** The independently modeled CEC/UC Davis pilot results were not statistically significant after adjustment; cite "up to 40%" only as a vendor claim.
- **Wexus pricing is quote-based** — no public per-meter dollar figures exist; the three-tier structure is confirmed but amounts are not.
- **Several competitor "AI" features are roadmap, not shipped** — Orchard's Canary is "forthcoming," and Cropwise AI's vision pest-detection is a stated future iteration. Treat as direction, not current capability.
- **The "Linear/Stripe quality bar" is a craft target, not a feature list** — it's achieved through speed, restraint, typography, and consistency, which require sustained design investment beyond copying patterns.
