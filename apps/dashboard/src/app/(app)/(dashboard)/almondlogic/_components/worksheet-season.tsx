"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { en } from "@/copy/en";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The worksheet season switcher: sets ?cropYear= and lets the server re-resolve the worksheet for
// that season. Preserves any other search params. Presentational only — the list of seasons and the
// active season are resolved on the server.
export function WorksheetSeason({ seasons, active }: { seasons: readonly number[]; active: number }) {
  const router = useRouter();
  const params = useSearchParams();

  function onChange(value: string): void {
    const next = new URLSearchParams(params.toString());
    next.set("cropYear", value);
    router.push(`?${next.toString()}`);
  }

  return (
    <label className="inline-flex items-center gap-2">
      <span className="type-label-caps text-on-surface-variant">{en.crops.worksheet.seasonPicker}</span>
      <Select value={String(active)} onValueChange={onChange}>
        <SelectTrigger className="h-9 w-28 tnum" aria-label={en.crops.worksheet.seasonPicker}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {seasons.map((year) => (
            <SelectItem key={year} value={String(year)} className="tnum">
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
