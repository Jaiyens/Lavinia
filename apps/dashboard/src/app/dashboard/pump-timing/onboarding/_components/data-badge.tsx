// A small mono pill marking a synthetic figure: a sandbox account, sample data, or a
// sample finding. Kept tiny and quiet so it informs without alarming, and always shown
// on any number that is not the farmer's own real PG&E data.

export function DataBadge({ label }: { label: string }) {
  return (
    <span className="border-border-strong text-muted inline-flex w-fit items-center rounded-full border px-3 py-1 font-mono text-[0.68rem] uppercase tracking-wider">
      {label}
    </span>
  );
}
