"use client";

import { useMemo } from "react";
import { useQueryState } from "nuqs";
import { en } from "@/copy/en";
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
  // A stale deep-link value not among this farm's options still renders verbatim as the
  // selected option, so the control never claims "All" while a filter is active.
  const stale = value !== null && value !== "" && !options.includes(value);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="type-label-caps text-on-surface-variant">
        {label}
      </label>
      <select
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
        className="min-h-[44px] w-full min-w-0 max-w-full rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-lowest px-3 type-body-md text-on-surface sm:w-auto sm:max-w-[18rem]"
      >
        <option value="">{allLabel}</option>
        {stale && <option value={value}>{value}</option>}
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
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
    <div className="flex flex-wrap items-end gap-3">
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
        <button
          type="button"
          onClick={clearAll}
          className="min-h-[44px] rounded-[var(--radius-control)] border border-outline-variant px-4 type-body-md text-on-surface transition-colors hover:bg-surface-container-low"
        >
          {t.clear}
        </button>
      )}
    </div>
  );
}
