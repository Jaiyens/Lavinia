import { describe, expect, it } from "vitest";
import {
  findingsAtRiskUsd,
  isSolarBillingFinding,
  toFindingViews,
  type FindingRow,
  type FindingView,
} from "./findings";
import { SOLAR_TOOL } from "@/lib/energy/solar-nem";

const METERS = [
  { id: "pump-1", name: "Lateral 3 Booster" },
  { id: "pump-2", name: "Old Vineyard Well" },
];

function row(overrides: Partial<FindingRow>): FindingRow {
  return {
    id: "rec-1",
    tool: "rate-optimization",
    situation: "Lateral 3 Booster is billed on AG-C.",
    action: {
      kind: "switch_rate",
      label: "Move it to AG-A",
      // The live engine (run.ts -> rate-compare.ts) writes the target as `toSchedule`.
      params: { pumpId: "pump-1", toSchedule: "AG-A" },
    },
    impactUsd: 13644.97,
    impactNote: null,
    severity: "act",
    status: "pending",
    result: null,
    ...overrides,
  };
}

describe("toFindingViews", () => {
  it("drops a finding with no dollar impact and no impact note (AC5), including whitespace notes", () => {
    const views = toFindingViews(
      [
        row({ id: "shown", impactUsd: 120, impactNote: null }),
        row({ id: "note-only", impactUsd: null, impactNote: "Worth a look on the next bill" }),
        row({ id: "hidden", impactUsd: null, impactNote: null }),
        row({ id: "blank-note", impactUsd: null, impactNote: "   " }),
      ],
      METERS,
    );
    expect(views.map((v) => v.id).sort()).toEqual(["note-only", "shown"]);
  });

  it("extracts the meter linkage from action.params.pumpId and resolves the name", () => {
    const [view] = toFindingViews([row({})], METERS);
    expect(view?.meterId).toBe("pump-1");
    expect(view?.meterName).toBe("Lateral 3 Booster");
    expect(view?.actionLabel).toBe("Move it to AG-A");
  });

  it("surfaces the grounded action kind off the persisted action, null when unreadable", () => {
    const [view] = toFindingViews([row({})], METERS);
    expect(view?.actionKind).toBe("switch_rate");
    const [junk] = toFindingViews([row({ id: "junk", action: "not an object" })], METERS);
    expect(junk?.actionKind).toBeNull();
  });

  it("surfaces the rate-switch target from action.kind/params.toSchedule (the grounded read, not the label)", () => {
    // The production label "Move it to AG-A" never contains the word "switch"; the target must come
    // from the machine verb + params.toSchedule, so a downstream consumer (the report) never
    // string-matches it. The default row() carries the live `toSchedule` field.
    const [view] = toFindingViews([row({})], METERS);
    expect(view?.rateSwitchTo).toBe("AG-A");
    // Backward compatibility: rows persisted before the field rename still carry `to`, and resolve.
    const [legacy] = toFindingViews(
      [row({ action: { kind: "switch_rate", label: "Move it to AG-A", params: { pumpId: "pump-1", to: "AG-A" } } })],
      METERS,
    );
    expect(legacy?.rateSwitchTo).toBe("AG-A");
    // A non-switch (fleet) action, a non-switch review, and a switch with no target carry no target.
    const others = toFindingViews(
      [
        row({
          id: "fleet",
          action: { kind: "review_legacy_fleet", label: "Review these rates", params: { pumpIds: ["a"] } },
        }),
        row({
          id: "review",
          action: { kind: "review_rate", label: "Review this meter's rate", params: { pumpId: "pump-2" } },
        }),
        row({
          id: "no-target",
          action: { kind: "switch_rate", label: "Move it", params: { pumpId: "pump-1" } },
        }),
      ],
      METERS,
    );
    expect(others.find((v) => v.id === "fleet")?.rateSwitchTo).toBeNull();
    expect(others.find((v) => v.id === "review")?.rateSwitchTo).toBeNull();
    expect(others.find((v) => v.id === "no-target")?.rateSwitchTo).toBeNull();
  });

  it("reads the switch source/target from params.toSchedule/fromSchedule (the engine's real keys)", () => {
    // The engine writes the target to params.toSchedule, not params.to (the prior bug read
    // only .to and left rateSwitchTo null for every real finding). Prove the canonical keys
    // are extracted, and that .to/.from still work as the legacy fallback.
    const [grounded] = toFindingViews(
      [
        row({
          id: "schedule-keys",
          action: {
            kind: "switch_rate",
            label: "Move it to AG-C",
            params: { pumpId: "pump-1", fromSchedule: "AG-B", toSchedule: "AG-C" },
          },
        }),
      ],
      METERS,
    );
    expect(grounded?.rateSwitchTo).toBe("AG-C");
    expect(grounded?.rateSwitchFrom).toBe("AG-B");

    const [legacy] = toFindingViews(
      [
        row({
          id: "legacy-keys",
          action: {
            kind: "switch_rate",
            label: "Move it to AG-A",
            params: { pumpId: "pump-1", from: "AG-C", to: "AG-A" },
          },
        }),
      ],
      METERS,
    );
    expect(legacy?.rateSwitchTo).toBe("AG-A");
    expect(legacy?.rateSwitchFrom).toBe("AG-C");

    // toSchedule wins over the legacy .to when both are present.
    const [both] = toFindingViews(
      [
        row({
          id: "both-keys",
          action: {
            kind: "switch_rate",
            label: "Move it",
            params: { pumpId: "pump-1", to: "AG-OLD", toSchedule: "AG-C" },
          },
        }),
      ],
      METERS,
    );
    expect(both?.rateSwitchTo).toBe("AG-C");
  });

  it("tolerates fleet-level and malformed actions: meterId/label null, never a throw", () => {
    const views = toFindingViews(
      [
        // The fleet finding carries pumpIds (array), not a single pumpId.
        row({
          id: "fleet",
          action: { kind: "review_legacy_fleet", label: "Review these rates", params: { pumpIds: ["a", "b"] } },
        }),
        row({ id: "junk", action: "not an object" }),
        row({ id: "unknown-pump", action: { label: "Check it", params: { pumpId: "pump-x" } } }),
      ],
      METERS,
    );
    expect(views.find((v) => v.id === "fleet")?.meterId).toBeNull();
    expect(views.find((v) => v.id === "fleet")?.actionLabel).toBe("Review these rates");
    expect(views.find((v) => v.id === "junk")?.meterId).toBeNull();
    expect(views.find((v) => v.id === "junk")?.actionLabel).toBeNull();
    // A pumpId no meter matches keeps the id (the trace just has no name).
    expect(views.find((v) => v.id === "unknown-pump")?.meterId).toBe("pump-x");
    expect(views.find((v) => v.id === "unknown-pump")?.meterName).toBeNull();
  });

  it("sorts by severity (act > watch > info), then by dollar impact descending; a note-only finding sorts as zero dollars", () => {
    const views = toFindingViews(
      [
        row({ id: "info-big", severity: "info", impactUsd: 9999 }),
        row({ id: "act-note-only", severity: "act", impactUsd: null, impactNote: "No number yet" }),
        row({ id: "act-small", severity: "act", impactUsd: 100 }),
        row({ id: "act-big", severity: "act", impactUsd: 5000 }),
        row({ id: "watch", severity: "watch", impactUsd: 8000 }),
      ],
      METERS,
    );
    expect(views.map((v) => v.id)).toEqual([
      "act-big",
      "act-small",
      "act-note-only",
      "watch",
      "info-big",
    ]);
  });

  it("drops a finding whose situation is empty or whitespace (no blank narrative line)", () => {
    const views = toFindingViews(
      [row({ id: "blank", situation: "   " }), row({ id: "told", situation: "A real story." })],
      METERS,
    );
    expect(views.map((v) => v.id)).toEqual(["told"]);
  });

  it("narrows an unknown severity to info (safe) and an unknown status to dismissed (closed, never actionable); reads result.note", () => {
    const [view] = toFindingViews(
      [
        row({
          severity: "urgent!!",
          status: "weird",
          result: { followed: true, note: "Saved about what we said" },
        }),
      ],
      METERS,
    );
    expect(view?.severity).toBe("info");
    expect(view?.status).toBe("dismissed");
    expect(view?.resultNote).toBe("Saved about what we said");
  });

  it("does not mutate its inputs", () => {
    const rows = [row({ id: "b", severity: "info" }), row({ id: "a", severity: "act" })];
    const snapshot = JSON.stringify(rows);
    toFindingViews(rows, METERS);
    expect(JSON.stringify(rows)).toBe(snapshot);
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
  });
});

describe("findingsAtRiskUsd", () => {
  it("sums dollar impacts, treating note-only findings as zero", () => {
    const views = toFindingViews(
      [
        row({ id: "a", impactUsd: 1200.5 }),
        row({ id: "b", impactUsd: 800 }),
        row({ id: "c", impactUsd: null, impactNote: "No number yet" }),
      ],
      METERS,
    );
    expect(findingsAtRiskUsd(views)).toBeCloseTo(2000.5);
  });

  it("ignores negative impacts: a credit-shaped finding never deflates the at-stake sum", () => {
    const views = toFindingViews(
      [row({ id: "a", impactUsd: 1000 }), row({ id: "credit", impactUsd: -600 })],
      METERS,
    );
    expect(findingsAtRiskUsd(views)).toBe(1000);
  });
});

describe("isSolarBillingFinding (G-2 honest-dollar separation guard)", () => {
  // Build each candidate through the real toFindingViews path so the predicate is exercised against
  // persisted-shape rows (the actionKind narrowing included), not a hand-mocked FindingView.
  function view(overrides: Partial<FindingRow>): FindingView {
    const [v] = toFindingViews([row(overrides)], METERS);
    if (v === undefined) throw new Error("row produced no view");
    return v;
  }

  it("stamps the billing chip on the F2 demand-charge finding (SOLAR_TOOL + review_solar_demand)", () => {
    // The shape run-solar-insight.ts persists for F2: SOLAR_TOOL, severity info, the demand dollar in
    // impactNote (never impactUsd), action.kind review_solar_demand.
    const f2 = view({
      tool: SOLAR_TOOL,
      severity: "info",
      impactUsd: null,
      impactNote: "About $2,400 of its bills on file is the demand charge, which solar cannot reduce.",
      action: {
        kind: "review_solar_demand",
        label: "See its evening demand",
        params: { pumpId: "pump-1", demandOwedCents: 240000 },
      },
    });
    expect(isSolarBillingFinding(f2)).toBe(true);
  });

  it("does NOT stamp the chip on the legacy track_trueup SOLAR_TOOL info finding (the inverted-honesty regression)", () => {
    // The legacy solarNemChecks track_trueup emitter (still live on the demo farm + the public Tour,
    // B-1/ADR-S05) shares the SOLAR_TOOL + severity:info shape, but its note is a NET-METERING true-up
    // message. Stamping "On your bill / this is a charge, not a solar credit" over it would invert the
    // honesty contract this guard exists to protect. The unique action kind excludes it.
    const trueUp = view({
      tool: SOLAR_TOOL,
      severity: "info",
      impactUsd: null,
      impactNote:
        "This is a NEM2 account, so the credits and charges net out at the April true-up. Watch the running balance so that bill is not a surprise.",
      action: {
        kind: "track_trueup",
        label: "Track the April true-up",
        params: { pumpId: "pump-1", nemType: "nem2", trueUpMonth: 4 },
      },
    });
    expect(isSolarBillingFinding(trueUp)).toBe(false);
  });

  it("does NOT stamp the chip on watch-severity solar findings (F1 rate-legibility, F3 aggregation)", () => {
    const f1 = view({
      tool: SOLAR_TOOL,
      severity: "watch",
      impactUsd: null,
      impactNote: "Worth verifying this schedule.",
      action: { kind: "verify_solar_schedule", label: "Verify the schedule", params: { pumpId: "pump-1" } },
    });
    const f3 = view({
      tool: SOLAR_TOOL,
      severity: "watch",
      impactUsd: null,
      impactNote: "Check which array it belongs to.",
      action: { kind: "verify_aggregation", label: "Verify the aggregation", params: { pumpId: "pump-1", arrayId: null } },
    });
    expect(isSolarBillingFinding(f1)).toBe(false);
    expect(isSolarBillingFinding(f3)).toBe(false);
  });

  it("does NOT stamp the chip on a non-solar tool, even an info finding with a review_solar_demand-looking kind", () => {
    // The energy card path must stay untouched: a different tool never qualifies, regardless of kind.
    const energyInfo = view({
      tool: "pump-timing",
      severity: "info",
      impactUsd: null,
      impactNote: "These cycles reconciled within a dollar of the estimate.",
      action: { kind: "review_solar_demand", label: "Look", params: { pumpId: "pump-1" } },
    });
    expect(isSolarBillingFinding(energyInfo)).toBe(false);
  });
});
