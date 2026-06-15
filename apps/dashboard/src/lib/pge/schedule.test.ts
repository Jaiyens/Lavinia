import { describe, expect, it } from "vitest";
import { cycleClose, nextCycleClose } from "./schedule";
import { loadMeterReadSchedule } from "./schedule-load";

// The loader reads the COMMITTED fixture (the real published 2026 table), so these
// tests double as transcription guards on the source data.
const schedule = loadMeterReadSchedule();

describe("loadMeterReadSchedule", () => {
  it("loads the 21 real serial letters plus the legacy MR codes, 12 ISO dates each", () => {
    const letters = "BCDFGHJKLMNPQRSTVWXYZ".split("");
    for (const letter of letters) {
      expect(schedule.cycles[letter], letter).toHaveLength(12);
    }
    expect(schedule.cycles["MR-07"]).toHaveLength(12); // demo seed path stays alive
    expect(schedule.year).toBe(2026);
    expect(schedule.mayShiftNote).toContain("slightly different date");
  });
});

describe("cycleClose", () => {
  it("spot-checks the published table, including the December 2025 wrap", () => {
    // Early letters read for their JANUARY statement in late December 2025.
    expect(cycleClose("B", 1, 2026, schedule)).toBe("2025-12-23");
    expect(cycleClose("J", 1, 2026, schedule)).toBe("2025-12-31");
    // K is the first letter whose January read lands in January.
    expect(cycleClose("K", 1, 2026, schedule)).toBe("2026-01-02");
    // The real account's March closes match Q's published 3/12.
    expect(cycleClose("Q", 3, 2026, schedule)).toBe("2026-03-12");
    expect(cycleClose("Z", 12, 2026, schedule)).toBe("2026-12-18");
  });

  it("tolerates case and whitespace on the stored serial", () => {
    expect(cycleClose(" h ", 4, 2026, schedule)).toBe("2026-04-01");
  });

  it("returns null for unknown serials - including Rotating Outage Block codes (AC3)", () => {
    // The bill prints BOTH "Serial H" and "Rotating Outage Block 14A"; only the
    // serial drives cycle-close. An outage block code is not in the table.
    expect(cycleClose("14A", 3, 2026, schedule)).toBeNull();
    expect(cycleClose("", 3, 2026, schedule)).toBeNull();
    expect(cycleClose("AA", 3, 2026, schedule)).toBeNull();
  });

  it("returns null outside the table's coverage, never a guess", () => {
    expect(cycleClose("Q", 0, 2026, schedule)).toBeNull();
    expect(cycleClose("Q", 13, 2026, schedule)).toBeNull();
    expect(cycleClose("Q", 3.5, 2026, schedule)).toBeNull();
    expect(cycleClose("Q", 3, 2027, schedule)).toBeNull();
  });
});

describe("nextCycleClose", () => {
  it("finds the next scheduled close on or after a date", () => {
    expect(nextCycleClose("Q", "2026-03-01", schedule)).toBe("2026-03-12");
    expect(nextCycleClose("Q", "2026-03-12", schedule)).toBe("2026-03-12"); // on the day
    expect(nextCycleClose("Q", "2026-03-13", schedule)).toBe("2026-04-10");
    expect(nextCycleClose("B", "2025-12-01", schedule)).toBe("2025-12-23"); // the wrap
  });

  it("returns null past the horizon or for unknown serials", () => {
    expect(nextCycleClose("Q", "2027-01-01", schedule)).toBeNull();
    expect(nextCycleClose("14A", "2026-01-01", schedule)).toBeNull();
  });

  it("accepts a full ISO timestamp", () => {
    expect(nextCycleClose("Q", "2026-03-01T12:00:00.000Z", schedule)).toBe("2026-03-12");
  });
});
