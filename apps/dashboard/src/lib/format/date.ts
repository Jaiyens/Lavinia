// Pure date formatting for the billing-cycle surface: short, farmer-facing close
// dates ("Fri the 20th"). ISO date in, plain English out. PG&E read dates are
// calendar days, formatted in UTC to match how they are stored (no tz drift).

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "1st", "2nd", "3rd", "11th", "21st" ... */
export function ordinal(day: number): string {
  const rem100 = day % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

/** "2026-03-20" (or a full ISO) -> "Fri the 20th". Empty string for a bad date. */
export function closeDateShort(iso: string): string {
  const ms = Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return "";
  const d = new Date(ms);
  const weekday = WEEKDAYS[d.getUTCDay()] ?? "";
  return `${weekday} the ${ordinal(d.getUTCDate())}`;
}
