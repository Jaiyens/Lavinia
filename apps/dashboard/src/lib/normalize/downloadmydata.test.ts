import { describe, expect, it } from "vitest";
import { normalizeDownloadMyData, normalizeDownloadMyDataCsv } from "./downloadmydata";

// A PG&E "Download My Data" CSV the shape of the real export: a preamble title line
// above the header, 15-minute interval rows keyed on Service Agreement ID, with the
// Direction of Energy (D/R), TOU Code, and Daylight Savings Flag columns.
const HEADER =
  "Account ID,Service Agreement ID,Service UUID,Service Point ID,Meter Badge Number," +
  "Service Descriptor,Rate Code,Interval Billed,Date,Time,Usage Hour,Interval Number," +
  "Interval Length,TOU Code,Daylight Savings Flag,Direction of Energy,Unit of Measure," +
  "Usage Value,Estimate Flag";

function row(parts: Record<string, string>): string {
  const d = {
    acct: "96005793",
    sa: "91898735",
    uuid: "2500620375",
    spid: "5802977586",
    meter: "1009983696",
    desc: "",
    rate: "HAGC",
    billed: "Y",
    date: "2026-03-04",
    time: "2026-03-04 00:15",
    hour: "1",
    interval: "1",
    len: "15",
    tou: "WOP",
    dst: "N",
    dir: "D",
    uom: "KWH",
    usage: "0.008000",
    est: "A",
    ...parts,
  };
  return [
    d.acct, d.sa, d.uuid, d.spid, d.meter, d.desc, d.rate, d.billed, d.date, d.time,
    d.hour, d.interval, d.len, d.tou, d.dst, d.dir, d.uom, d.usage, d.est,
  ].join(",");
}

describe("normalizeDownloadMyDataCsv", () => {
  it("parses past the preamble, groups by SA ID, carries identity + usage", () => {
    const csv = [
      "Historical_20260304-20260331",
      HEADER,
      row({ hour: "1", interval: "1", time: "2026-03-04 00:15", usage: "0.008000" }),
      row({ hour: "1", interval: "2", time: "2026-03-04 00:30", usage: "0.009000" }),
    ].join("\n");

    const meters = normalizeDownloadMyDataCsv(csv);
    expect(meters).toHaveLength(1);
    const m = meters[0]!;
    expect(m.serviceId).toBe("91898735");
    expect(m.accountNumber).toBe("96005793");
    expect(m.meterSerial).toBe("1009983696");
    expect(m.tariff).toBe("HAGC");
    expect(m.fuel).toBe("electric");
    expect(m.summaries).toEqual([]); // usage only: no dollars
    expect(m.intervals).toHaveLength(2);
  });

  it("strips PG&E's zero-padded SA ID to the natural form the master sheet joins on", () => {
    // The real export pads every SA to 10 digits ("0091898735"); the master uses "91898735".
    // Without the strip these land as two different Pumps for the same physical meter.
    const csv = [HEADER, row({ sa: "0091898735" })].join("\n");
    const m = normalizeDownloadMyDataCsv(csv)[0]!;
    expect(m.serviceId).toBe("91898735");
  });

  it("canonicalizes the zero-padded Account ID the same way inventory.ts does (one Account row)", () => {
    // The export pads Account ID to 10 digits with no check digit ("0096005793"); the master
    // sheet prints "0096005793-3". Both must collapse to "96005793" or they fork two Accounts.
    const csv = [HEADER, row({ acct: "0096005793" })].join("\n");
    const m = normalizeDownloadMyDataCsv(csv)[0]!;
    expect(m.accountNumber).toBe("96005793");
  });

  it("treats Interval Length 60 as 60 MINUTES (durationSec 3600), not 60 seconds", () => {
    // Some Batth meters report hourly. 60 is minutes in this CSV, so durationSec must be 3600;
    // a durationSec of 60 inflates the computed demand kW 60x (the basis of every rate finding).
    const csv = [HEADER, row({ len: "60" })].join("\n");
    const m = normalizeDownloadMyDataCsv(csv)[0]!;
    expect(m.intervals[0]!.durationSec).toBe(3600);
  });

  it("derives a UTC start from Usage Hour + Interval Number using the DST flag (PST=-8)", () => {
    const csv = [HEADER, row({ hour: "1", interval: "1", dst: "N" })].join("\n");
    const m = normalizeDownloadMyDataCsv(csv)[0]!;
    // Usage Hour 1 / Interval 1 = midnight PST -> 08:00Z; interval length 15 min -> 900s.
    expect(m.intervals[0]!.start).toBe("2026-03-04T08:00:00.000Z");
    expect(m.intervals[0]!.durationSec).toBe(900);
    expect(m.intervals[0]!.touCode).toBe("WOP");
    expect(m.intervals[0]!.direction).toBe("import");
  });

  it("keeps import (D) and export (R) at the same instant as distinct readings", () => {
    const csv = [
      HEADER,
      row({ sa: "92923550", dir: "D", usage: "0.500000", hour: "1", interval: "1" }),
      row({ sa: "92923550", dir: "R", usage: "1.200000", hour: "1", interval: "1" }),
    ].join("\n");
    const m = normalizeDownloadMyDataCsv(csv)[0]!;
    expect(m.intervals).toHaveLength(2);
    const dirs = m.intervals.map((i) => i.direction).sort();
    expect(dirs).toEqual(["export", "import"]);
    const exp = m.intervals.find((i) => i.direction === "export")!;
    expect(exp.kWh).toBe(1.2);
    expect(exp.start).toBe("2026-03-04T08:00:00.000Z");
  });

  it("falls back to the Time column (read as interval end) and PDT (-7) when no hour/interval", () => {
    // A leaner export without Usage Hour / Interval Number columns.
    const header = "Service Agreement ID,Rate Code,Time,Interval Length,Daylight Savings Flag,Direction of Energy,Unit of Measure,Usage Value";
    const csv = [header, "91898735,HAGC,2026-07-01 01:00,15,Y,D,KWH,0.010000"].join("\n");
    const m = normalizeDownloadMyDataCsv(csv)[0]!;
    // 01:00 PDT (-7) end -> 08:00Z; start = end - 15 min = 07:45Z.
    expect(m.intervals[0]!.start).toBe("2026-07-01T07:45:00.000Z");
  });

  it("falls back to the Time column for an HOURLY interval (start = end - 1 hour, durationSec 3600)", () => {
    // Same lean shape but a 60-minute meter: the fallback must subtract a full hour, which only
    // happens when 60 is read as minutes (3600s). If 60 were read as 60s the start would be off
    // by ~59 minutes.
    const header = "Service Agreement ID,Rate Code,Time,Interval Length,Daylight Savings Flag,Direction of Energy,Unit of Measure,Usage Value";
    const csv = [header, "91898735,AG-B,2026-07-01 02:00,60,Y,D,KWH,1.000000"].join("\n");
    const m = normalizeDownloadMyDataCsv(csv)[0]!;
    // 02:00 PDT (-7) end -> 09:00Z; start = end - 60 min = 08:00Z.
    expect(m.intervals[0]!.start).toBe("2026-07-01T08:00:00.000Z");
    expect(m.intervals[0]!.durationSec).toBe(3600);
  });

  it("returns nothing when the header cannot be located", () => {
    expect(normalizeDownloadMyDataCsv("nothing,useful,here\n1,2,3")).toEqual([]);
  });

  it("dispatches CSV vs XML by sniffing", () => {
    const csv = [HEADER, row({})].join("\n");
    expect(normalizeDownloadMyData(csv)).toHaveLength(1);
    // An XML feed routes to the ESPI path (no rows here, just confirms no CSV parse throws).
    expect(normalizeDownloadMyData("<?xml version=\"1.0\"?><feed></feed>")).toEqual([]);
  });
});
