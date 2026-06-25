"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";
import { ChevronDown } from "lucide-react";
import { en } from "@/copy/en";
import { Button } from "@/components/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { MeterView } from "@/lib/dashboard/load";
import { filterOptions } from "@/lib/dashboard/filters";
import { SURFACE } from "@/lib/dashboard/surface";

// The filter controls (Story 2.6, FR-11): one labeled select per dimension that actually has
// values on this farm (an empty dimension renders no control - never a dead dropdown), writing
// the canonical nuqs entity/ranch/rate keys that the KPI strip, the table, and later lenses all
// read. "Show whole farm" clears exactly the keys it owns; lens and meter are never touched.
//
// The Solar tab (A-7, FR1/UX5) opts into two more dimensions via `showAccount` / `showProgram`:
// `account` (the PG&E account number) and `program` (the net-metering program token). They are
// off by default so the energy dashboard is byte-for-byte unchanged; when on, they render only
// when the farm actually carries those values (the same honest empty-dimension rule), and the
// clear affordance clears them too.

const t = en.shell.filter;

function FilterSelect({
  id,
  label,
  allLabel,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  allLabel: string;
  options: string[];
  value: string | null;
  onChange: (next: string | null) => void;
}) {
  // A stale deep-link value not among this farm's options still renders verbatim as a selected
  // option, so the control never claims "All" while a filter is active.
  const stale = value !== null && value !== "" && !options.includes(value);
  const current = isActiveFilterValue(value) ? value : allLabel;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span id={`${id}-label`} className="type-label-caps text-on-surface-variant">
        {label}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id={id}
            variant="outline"
            size="lg"
            aria-labelledby={`${id}-label ${id}`}
            className="min-h-[44px] w-full min-w-[11rem] justify-between gap-2 whitespace-nowrap font-normal sm:w-auto sm:max-w-[20rem]"
          >
            <span className="min-w-0 truncate">{current}</span>
            <ChevronDown className="shrink-0 opacity-60" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-[20rem] min-w-[12rem] overflow-y-auto"
        >
          <DropdownMenuRadioGroup
            value={value ?? ""}
            onValueChange={(next) => onChange(next === "" ? null : next)}
          >
            <DropdownMenuRadioItem value="">{allLabel}</DropdownMenuRadioItem>
            {stale && <DropdownMenuRadioItem value={value}>{value}</DropdownMenuRadioItem>}
            {options.map((opt) => (
              <DropdownMenuRadioItem key={opt} value={opt}>
                {opt}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Active means the key would actually narrow the farm: non-null AND non-blank after trim
    (filterMeters treats a blank key as a no-op, so "" must not light the clear affordance). */
export function isActiveFilterValue(v: string | null): boolean {
  return v !== null && v.trim() !== "";
}

export function FilterBar({
  meters,
  showAccount = false,
  showProgram = false,
}: {
  meters: MeterView[];
  /** Render the PG&E-account filter (the Solar tab; A-7). Off keeps the energy dashboard unchanged. */
  showAccount?: boolean;
  /** Render the net-metering-program filter (the Solar tab; A-7). */
  showProgram?: boolean;
}) {
  const [entity, setEntity] = useQueryState(SURFACE.entity);
  const [ranch, setRanch] = useQueryState(SURFACE.ranch);
  const [rate, setRate] = useQueryState(SURFACE.rate);
  const [account, setAccount] = useQueryState(SURFACE.account);
  const [program, setProgram] = useQueryState(SURFACE.program);

  const options = useMemo(() => filterOptions(meters), [meters]);
  const showAccountControl = showAccount && options.accounts.length > 0;
  const showProgramControl = showProgram && options.programs.length > 0;
  const hasAnyControl =
    options.entities.length > 0 ||
    options.ranches.length > 0 ||
    options.rates.length > 0 ||
    showAccountControl ||
    showProgramControl;
  // Only count a dimension this bar actually owns toward the clear affordance, so a stale account
  // deep link on the energy dashboard (which never shows the control) does not light a dead button.
  const hasActiveFilter =
    isActiveFilterValue(entity) ||
    isActiveFilterValue(ranch) ||
    isActiveFilterValue(rate) ||
    (showAccount && isActiveFilterValue(account)) ||
    (showProgram && isActiveFilterValue(program));

  // A farm with nothing to filter by shows no bar at all - unless a stale deep link carries an
  // active key, in which case the clear affordance must still be reachable.
  if (!hasAnyControl && !hasActiveFilter) return null;

  const clearAll = () => {
    void setEntity(null);
    void setRanch(null);
    void setRate(null);
    if (showAccount) void setAccount(null);
    if (showProgram) void setProgram(null);
  };

  return (
    <div className="flex flex-wrap items-end gap-5">
      {options.entities.length > 0 && (
        <FilterSelect
          id="filter-entity"
          label={t.entity}
          allLabel={t.allEntities}
          options={options.entities}
          value={entity}
          onChange={(v) => void setEntity(v)}
        />
      )}
      {options.ranches.length > 0 && (
        <FilterSelect
          id="filter-ranch"
          label={t.ranch}
          allLabel={t.allRanches}
          options={options.ranches}
          value={ranch}
          onChange={(v) => void setRanch(v)}
        />
      )}
      {options.rates.length > 0 && (
        <FilterSelect
          id="filter-rate"
          label={t.rate}
          allLabel={t.allRates}
          options={options.rates}
          value={rate}
          onChange={(v) => void setRate(v)}
        />
      )}
      {showAccountControl && (
        <FilterSelect
          id="filter-account"
          label={t.account}
          allLabel={t.allAccounts}
          options={options.accounts}
          value={account}
          onChange={(v) => void setAccount(v)}
        />
      )}
      {showProgramControl && (
        <FilterSelect
          id="filter-program"
          label={t.program}
          allLabel={t.allPrograms}
          options={options.programs}
          value={program}
          onChange={(v) => void setProgram(v)}
        />
      )}
      {hasActiveFilter && (
        <Button type="button" variant="outline" size="lg" onClick={clearAll} className="min-h-[44px]">
          {t.clear}
        </Button>
      )}
    </div>
  );
}
