// A tiny, dependency-free CSV parser. Growers export their master meter list from
// Excel/Sheets as CSV; this turns that text into rows of string cells. It handles the
// cases a real spreadsheet produces: quoted fields, commas and newlines inside quotes,
// escaped quotes (""), a leading UTF-8 BOM, and CRLF line endings. Pure (no IO), so it
// is unit-tested and reused on the server with zero external calls.

/** Parse CSV text into rows of cells. Fully blank lines are dropped. */
export function parseCsv(input: string): string[][] {
  // Strip a leading BOM that Excel often writes.
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === ",") {
      endField();
      i += 1;
      continue;
    }
    if (c === "\r") {
      i += 1;
      continue;
    }
    if (c === "\n") {
      endRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }
  // Flush the trailing field/row (no newline at EOF).
  if (field !== "" || row.length > 0) endRow();

  // Drop rows that are entirely empty (blank lines, trailing newline).
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}
