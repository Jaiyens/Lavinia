"use client";

import { useActionState, useState } from "react";
import { en } from "@/copy/en";
import {
  type ScanState,
  type UploadState,
  connectGreenButtonAction,
  connectManualAction,
  connectSampleAction,
  connectSpreadsheetAction,
  scanBillAction,
} from "../actions";
import { BayouConnect } from "./bayou-connect";
import { SubmitButton } from "./submit-button";
import type { BillScanResult } from "@/lib/onboarding/vision";

const c = en.onboarding.connect;

type ManualFields = {
  farmName: string;
  name: string;
  serviceId: string;
  meterSerial: string;
  rateSchedule: string;
  billingSerial: string;
  location: string;
};

const EMPTY: ManualFields = {
  farmName: "",
  name: "",
  serviceId: "",
  meterSerial: "",
  rateSchedule: "",
  billingSerial: "",
  location: "",
};

function TextField({
  name,
  label,
  value,
  onChange,
  required = false,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="label-caps text-muted">{label}</span>
      <input
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        aria-required={required || undefined}
        className="border-border bg-background focus:border-border-strong rounded-lg border px-3 py-2 text-sm outline-none"
      />
    </label>
  );
}

export function ConnectPaths() {
  const [manual, setManual] = useState<ManualFields>(EMPTY);
  const [showFallback, setShowFallback] = useState(false);
  const [scan, scanAction] = useActionState<ScanState, FormData>(scanBillAction, {});
  const [upload, uploadAction] = useActionState<UploadState, FormData>(
    connectGreenButtonAction,
    {},
  );
  const [sheet, sheetAction] = useActionState<UploadState, FormData>(
    connectSpreadsheetAction,
    {},
  );

  // When a new bill scan returns, pre-fill the manual form and reveal it. This is
  // the "adjust state while rendering" pattern (guarded by the last-applied result),
  // not an effect: the scan result is async state, not a user event.
  const [appliedScan, setAppliedScan] = useState<BillScanResult | null>(null);
  if (scan.result && scan.result !== appliedScan) {
    const r = scan.result;
    setAppliedScan(r);
    setManual((m) => ({
      farmName: r.accountName ?? m.farmName,
      // Only synthesize a name when the farmer has not already typed one.
      name: m.name.trim() ? m.name : r.serviceId ? `Service ${r.serviceId}` : m.name,
      serviceId: r.serviceId ?? m.serviceId,
      meterSerial: r.meterSerial ?? m.meterSerial,
      rateSchedule: r.rateSchedule ?? m.rateSchedule,
      billingSerial: r.billingSerial ?? m.billingSerial,
      location: r.address ?? m.location,
    }));
    setShowFallback(true);
  }

  const set = (k: keyof ManualFields) => (v: string) =>
    setManual((m) => ({ ...m, [k]: v }));

  return (
    <div className="space-y-8">
      {/* The one primary action: connect a live PG&E account. */}
      <BayouConnect />

      {/* Bulk path: upload a real PG&E Green Button export. One file can carry every
          account and meter, so this is how a large operation loads everything at once. */}
      <form
        action={uploadAction}
        className="border-border bg-card flex flex-col rounded-2xl border p-6"
      >
        <h2 className="font-display text-2xl text-balance">{c.uploadTitle}</h2>
        <p className="text-muted mt-2 text-[0.95rem] leading-relaxed text-pretty">{c.uploadNote}</p>
        <input
          type="file"
          name="files"
          accept=".xml,text/xml,application/xml"
          multiple
          className="text-muted file:label-caps mt-4 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-card-hover file:px-4 file:py-2 file:text-foreground"
        />
        <p className="text-faint mt-3 text-xs leading-relaxed text-pretty">{c.uploadHint}</p>
        <div className="mt-4">
          <SubmitButton label={c.uploadCta} pendingLabel={c.uploadWorking} variant="ghost" />
        </div>
        {upload.error ? (
          <p className="bg-tint text-ink-soft mt-3 rounded-lg px-3 py-2 text-sm leading-relaxed text-pretty">
            {upload.error}
          </p>
        ) : null}
      </form>

      {/* Whole-farm inventory: the grower's master meter list (CSV). Carries the org
          chart (entities, accounts, blocks) and serial codes no usage feed provides. */}
      <form
        action={sheetAction}
        className="border-border bg-card flex flex-col rounded-2xl border p-6"
      >
        <h2 className="font-display text-2xl text-balance">{c.sheetTitle}</h2>
        <p className="text-muted mt-2 text-[0.95rem] leading-relaxed text-pretty">{c.sheetNote}</p>
        <input
          type="file"
          name="sheet"
          accept=".csv,text/csv"
          className="text-muted file:label-caps mt-4 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-card-hover file:px-4 file:py-2 file:text-foreground"
        />
        <p className="text-faint mt-3 text-xs leading-relaxed text-pretty">{c.sheetHint}</p>
        <div className="mt-4">
          <SubmitButton label={c.sheetCta} pendingLabel={c.sheetWorking} variant="ghost" />
        </div>
        {sheet.error ? (
          <p className="bg-tint text-ink-soft mt-3 rounded-lg px-3 py-2 text-sm leading-relaxed text-pretty">
            {sheet.error}
          </p>
        ) : null}
      </form>

      {/* Quiet secondary paths: sample data, or hand entry. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <form action={connectSampleAction}>
          <button
            type="submit"
            className="label-caps text-muted hover:text-foreground transition-colors"
          >
            {c.sampleDataCta}
          </button>
        </form>
        {!showFallback ? (
          <button
            type="button"
            onClick={() => setShowFallback(true)}
            className="label-caps text-muted hover:text-foreground transition-colors"
          >
            {c.fallbackHeading}
          </button>
        ) : null}
      </div>

      {showFallback ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {/* Bill photo -> pre-fills the manual form. */}
          <form
            action={scanAction}
            className="border-border bg-card flex flex-col rounded-2xl border p-6"
          >
            <h3 className="font-display text-xl text-balance">{c.billTitle}</h3>
            <p className="text-muted mt-2 text-sm leading-relaxed text-pretty">{c.billNote}</p>
            <input
              type="file"
              name="photo"
              accept="image/*"
              className="text-muted file:label-caps mt-4 text-sm file:mr-3 file:rounded-full file:border-0 file:bg-card-hover file:px-4 file:py-2 file:text-foreground"
            />
            <div className="mt-4">
              <SubmitButton label={c.billCta} pendingLabel={c.working} variant="ghost" />
            </div>
            {scan.result ? (
              <p className="text-faint mt-3 text-xs leading-relaxed text-pretty">{c.billFilled}</p>
            ) : null}
          </form>

          {/* Manual entry (also the target of the bill scan). */}
          <form
            action={connectManualAction}
            className="border-border bg-card flex flex-col gap-3 rounded-2xl border p-6"
          >
            <h3 className="font-display text-xl text-balance">{c.manualTitle}</h3>
            <p className="text-muted text-sm leading-relaxed text-pretty">{c.manualNote}</p>
            <TextField name="farmName" label={c.farmNameLabel} value={manual.farmName} onChange={set("farmName")} />
            <TextField name="name" label={c.fieldName} value={manual.name} onChange={set("name")} required />
            <div className="grid grid-cols-2 gap-3">
              <TextField name="serviceId" label={c.fieldServiceId} value={manual.serviceId} onChange={set("serviceId")} />
              <TextField name="meterSerial" label={c.fieldMeterSerial} value={manual.meterSerial} onChange={set("meterSerial")} />
              <TextField name="rateSchedule" label={c.fieldRate} value={manual.rateSchedule} onChange={set("rateSchedule")} />
              <TextField name="billingSerial" label={c.fieldCycle} value={manual.billingSerial} onChange={set("billingSerial")} />
            </div>
            <TextField name="location" label={c.fieldLocation} value={manual.location} onChange={set("location")} />
            <div className="mt-2">
              <SubmitButton label={c.manualCta} pendingLabel={c.working} variant="ghost" />
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
