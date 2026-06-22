import { describe, expect, it } from "vitest";
import {
  detect,
  readDisputeCandidate,
  disputeDedupeKey,
  DISPUTE_FLOOR_USD,
  type AuditCandidateRow,
} from "./detect";

// Pure unit tests for the dispute selection step. No DB, no clock. They prove: only act-severity
// audit_bill findings above the floor are selected; the no-peak "watch" findings and below-floor
// excesses are dropped; the stable dedupe key is pumpId + cycleStart (independent of the row id);
// every dollar is READ off action.params (never recomputed); malformed rows fail closed.

/** A well-formed audit_bill recommendation row the engine would emit. */
function auditRow(over: Partial<AuditCandidateRow> = {}, params: Record<string, unknown> = {}): AuditCandidateRow {
  return {
    id: "rec-1",
    severity: "act",
    status: "pending",
    action: {
      kind: "audit_bill",
      label: "Check the May bill",
      params: {
        pumpId: "pump-a",
        cycleStart: "2026-05-01",
        cycleClose: "2026-05-31",
        totalBillUsd: 1800,
        medianTotalUsd: 1200,
        excessUsd: 600,
        ...params,
      },
    },
    ...over,
  };
}

describe("readDisputeCandidate", () => {
  it("selects a well-formed act-severity audit_bill above the floor and reads the engine figures", () => {
    const c = readDisputeCandidate(auditRow());
    expect(c).not.toBeNull();
    expect(c).toMatchObject({
      recommendationId: "rec-1",
      pumpId: "pump-a",
      cycleStart: "2026-05-01",
      cycleClose: "2026-05-31",
      totalBillUsd: 1800,
      medianTotalUsd: 1200,
      excessUsd: 600,
      dedupeKey: disputeDedupeKey("pump-a", "2026-05-01"),
    });
  });

  it("drops a non-audit_bill finding (a rate switch is not a dispute)", () => {
    const row = auditRow();
    (row.action as Record<string, unknown>).kind = "switch_rate";
    expect(readDisputeCandidate(row)).toBeNull();
  });

  it("does NOT escalate a no-peak 'watch' finding (only 'act' disputes)", () => {
    expect(readDisputeCandidate(auditRow({ severity: "watch" }))).toBeNull();
    expect(readDisputeCandidate(auditRow({ severity: "info" }))).toBeNull();
  });

  it("drops a non-pending finding (only open findings are disputed)", () => {
    expect(readDisputeCandidate(auditRow({ status: "done" }))).toBeNull();
    expect(readDisputeCandidate(auditRow({ status: "dismissed" }))).toBeNull();
  });

  it("drops an excess at or below the floor (a few dollars is not a dispute)", () => {
    expect(readDisputeCandidate(auditRow({}, { excessUsd: DISPUTE_FLOOR_USD }))).toBeNull();
    expect(readDisputeCandidate(auditRow({}, { excessUsd: DISPUTE_FLOOR_USD - 1 }))).toBeNull();
    expect(readDisputeCandidate(auditRow({}, { excessUsd: 0 }))).toBeNull();
    expect(readDisputeCandidate(auditRow({}, { excessUsd: -100 }))).toBeNull();
    // Just above the floor qualifies.
    expect(readDisputeCandidate(auditRow({}, { excessUsd: DISPUTE_FLOOR_USD + 0.5 }))).not.toBeNull();
  });

  it("fails closed on a malformed action (missing params, non-object, bad pumpId)", () => {
    expect(readDisputeCandidate(auditRow({ action: null }))).toBeNull();
    expect(readDisputeCandidate(auditRow({ action: "nope" }))).toBeNull();
    expect(readDisputeCandidate(auditRow({ action: { kind: "audit_bill" } }))).toBeNull();
    expect(readDisputeCandidate(auditRow({}, { pumpId: "" }))).toBeNull();
    expect(readDisputeCandidate(auditRow({}, { cycleStart: "  " }))).toBeNull();
    expect(readDisputeCandidate(auditRow({}, { excessUsd: "600" }))).toBeNull();
    expect(readDisputeCandidate(auditRow({}, { excessUsd: Number.NaN }))).toBeNull();
  });

  it("derives a missing total/median from the excess rather than dropping the row", () => {
    const c = readDisputeCandidate(auditRow({}, { totalBillUsd: null, medianTotalUsd: null }));
    expect(c).not.toBeNull();
    // total falls back to excess, median to 0 when neither is present.
    expect(c?.excessUsd).toBe(600);
    expect(c?.totalBillUsd).toBe(600);
    expect(c?.medianTotalUsd).toBe(0);
  });
});

describe("detect", () => {
  it("selects only the disputable rows from a mixed set", () => {
    const rows: AuditCandidateRow[] = [
      auditRow({ id: "a" }, { pumpId: "p1", cycleStart: "2026-05-01" }),
      auditRow({ id: "b", severity: "watch" }), // dropped: watch
      auditRow({ id: "c" }, { pumpId: "p2", cycleStart: "2026-06-01", excessUsd: 20 }), // dropped: below floor
      auditRow({ id: "d" }, { pumpId: "p3", cycleStart: "2026-07-01" }),
    ];
    const out = detect(rows);
    expect(out.map((c) => c.recommendationId)).toEqual(["a", "d"]);
  });

  it("dedupes on (pumpId, cycleStart) within one sweep, first wins (id stability)", () => {
    // The same meter+cycle re-inserted with a new id is one candidate, keyed on identity.
    const rows: AuditCandidateRow[] = [
      auditRow({ id: "old" }, { pumpId: "p1", cycleStart: "2026-05-01" }),
      auditRow({ id: "new" }, { pumpId: "p1", cycleStart: "2026-05-01" }),
    ];
    const out = detect(rows);
    expect(out).toHaveLength(1);
    expect(out[0]?.recommendationId).toBe("old");
    expect(out[0]?.dedupeKey).toBe(disputeDedupeKey("p1", "2026-05-01"));
  });

  it("returns an empty array for no rows", () => {
    expect(detect([])).toEqual([]);
  });
});
