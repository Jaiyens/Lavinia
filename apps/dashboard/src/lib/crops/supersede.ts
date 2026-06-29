// The append-only supersede predicate, shared by the position engine and the settlement-ingestion
// step so "which rows are live" has ONE definition. A row is superseded (dead) iff its id appears as
// some other row's supersedesId; the later row (e.g. a packer settlement) wins. The dead row is
// never mutated or removed — recompute just stops counting it.

export type Superseder = { id: string; supersedesId: string | null };

/** The live (non-superseded) subset of an append-only array. */
export function liveRows<T extends Superseder>(rows: readonly T[]): T[] {
  const superseded = new Set<string>();
  for (const row of rows) {
    if (row.supersedesId !== null) superseded.add(row.supersedesId);
  }
  return rows.filter((row) => !superseded.has(row.id));
}

/** The set of ids that have been superseded by some later row. */
export function supersededIds(rows: readonly Superseder[]): Set<string> {
  const out = new Set<string>();
  for (const row of rows) {
    if (row.supersedesId !== null) out.add(row.supersedesId);
  }
  return out;
}
