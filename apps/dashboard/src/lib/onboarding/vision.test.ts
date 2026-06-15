import { describe, expect, it } from "vitest";
import { readBillPhoto } from "./vision";

describe("readBillPhoto (stub)", () => {
  it("returns the committed sample bill fields, ignoring the image bytes", async () => {
    const result = await readBillPhoto({ filename: "bill.jpg" });
    expect(result).toEqual({
      accountName: "Olsen Family Farms",
      serviceId: "7720450050",
      meterSerial: "1010088820",
      rateSchedule: "AG-C",
      billingSerial: "MR-14",
      address: "21500 Avenue 18, Madera, CA 93637",
    });
  });

  it("works with no argument", async () => {
    const result = await readBillPhoto();
    expect(result.rateSchedule).toBe("AG-C");
  });
});
