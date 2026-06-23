import { describe, expect, it } from "vitest";
import {
  toBillDisputeCardView,
  toBillDisputeCardViews,
  type BillDisputeActionRow,
} from "./load";

// Pure tests for the Home card projection. They prove: only the surfacing statuses (proposed,
// executed) map to a card; the meter/cycle/excess come from the linked finding when present and
// fall back to the stored proposedCommand when the link was cleared; an executed action exposes
// the owner-scoped download href; a row with neither source is dropped (never a blank card).

const pumpNames = new Map([["pump-a", "West Pump 12"]]);

function row(over: Partial<BillDisputeActionRow> = {}): BillDisputeActionRow {
  return {
    id: "act-1",
    status: "proposed",
    reportId: null,
    recommendationId: "rec-1",
    proposedCommand: { pumpId: "pump-a", cycleStart: "2026-05-01" },
    recommendation: {
      id: "rec-1",
      severity: "act",
      status: "pending",
      action: {
        kind: "audit_bill",
        params: { pumpId: "pump-a", cycleStart: "2026-05-01", excessUsd: 600, totalBillUsd: 1800, medianTotalUsd: 1200 },
      },
    },
    ...over,
  };
}

describe("toBillDisputeCardView", () => {
  it("maps a proposed action with a linked finding (figures from the finding)", () => {
    const v = toBillDisputeCardView(row(), pumpNames);
    expect(v).toMatchObject({
      agentActionId: "act-1",
      status: "proposed",
      pumpName: "West Pump 12",
      month: "May",
      excessUsd: 600,
      downloadHref: null,
      recommendationId: "rec-1",
    });
  });

  it("exposes the owner-scoped download href for an executed packet", () => {
    const v = toBillDisputeCardView(row({ status: "executed", reportId: "rep-9" }), pumpNames);
    expect(v?.status).toBe("executed");
    expect(v?.downloadHref).toBe("/api/reports/rep-9/download");
  });

  it("falls back to the proposedCommand when the finding link was cleared", () => {
    const v = toBillDisputeCardView(
      row({ recommendation: null, recommendationId: null, status: "executed", reportId: "rep-1" }),
      pumpNames,
    );
    expect(v).not.toBeNull();
    expect(v?.pumpName).toBe("West Pump 12");
    expect(v?.month).toBe("May");
    // No grounded finding, so no excess figure (the card shows the ready state regardless).
    expect(v?.excessUsd).toBe(0);
  });

  it("does NOT surface a rejected or failed action on Home", () => {
    expect(toBillDisputeCardView(row({ status: "rejected" }), pumpNames)).toBeNull();
    expect(toBillDisputeCardView(row({ status: "failed" }), pumpNames)).toBeNull();
    expect(toBillDisputeCardView(row({ status: "approved" }), pumpNames)).toBeNull();
  });

  it("drops a row with neither a readable finding nor a command (never a blank card)", () => {
    const v = toBillDisputeCardView(
      row({ recommendation: null, proposedCommand: null }),
      pumpNames,
    );
    expect(v).toBeNull();
  });

  it("uses the pump id as a fallback name when the pump is unknown", () => {
    const v = toBillDisputeCardView(row(), new Map());
    expect(v?.pumpName).toBe("pump-a");
  });
});

describe("toBillDisputeCardViews", () => {
  it("drops the non-surfacing rows from a mixed set", () => {
    const views = toBillDisputeCardViews(
      [row({ id: "a" }), row({ id: "b", status: "rejected" }), row({ id: "c", status: "executed", reportId: "r" })],
      pumpNames,
    );
    expect(views.map((v) => v.agentActionId)).toEqual(["a", "c"]);
  });
});
