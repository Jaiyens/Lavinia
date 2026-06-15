"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { en } from "@/copy/en";
import {
  type ConnectState,
  connectPgeAction,
  uploadBillAction,
  uploadGreenButtonAction,
  uploadSpreadsheetAction,
} from "../actions";

const t = en.connect.picker;

// Story 5.2 - the source picker. Three sources (Connect PG&E, Upload bills, Upload meter
// list). "Continue to review" stays disabled until a real source (PG&E usage or a bill) is
// present (AC2). PG&E is one option among equals, not a forced first step; the LOA ("never
// upload a bill again") is a calm upsell on the PG&E card, not the entry gate (AC5).
export function SourcePicker({
  farmId,
  total,
  hasInventory,
  canContinue,
}: {
  farmId: string;
  total: number;
  hasInventory: boolean;
  canContinue: boolean;
}) {
  const status = canContinue
    ? t.statusReady(total)
    : hasInventory
      ? t.statusInventory(total)
      : t.statusNone;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-8 px-5 py-12">
      <div className="flex flex-col gap-3">
        <span className="type-label-caps text-on-surface-variant">{t.eyebrow}</span>
        <h1 className="type-title text-on-surface">{t.title}</h1>
        <p className="type-body-md text-on-surface-variant">{t.intro}</p>
      </div>

      <div className="flex flex-col gap-4">
        <PgeCard farmId={farmId} />
        <BillCard farmId={farmId} />
        <SpreadsheetCard farmId={farmId} />
      </div>

      <div className="flex flex-col gap-3 border-t border-outline-variant pt-6">
        <p className="type-body-md text-on-surface-variant">{status}</p>
        {canContinue ? <p className="type-body-sm text-on-surface-variant">{t.addMore}</p> : null}
        {canContinue ? (
          <Link href={`/onboarding/confirm?farm=${farmId}`}>
            <Button variant="primary" className="w-full">
              {t.continue}
            </Button>
          </Link>
        ) : (
          <Button variant="primary" className="w-full" disabled>
            {t.continue}
          </Button>
        )}
      </div>
    </main>
  );
}

function Card({
  title,
  body,
  note,
  children,
}: {
  title: string;
  body: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-outline-variant p-5">
      <div className="flex flex-col gap-1">
        <h2 className="type-body-md font-semibold text-on-surface">{title}</h2>
        <p className="type-body-sm text-on-surface-variant">{body}</p>
        {note ? <p className="type-body-sm text-on-surface-variant/80">{note}</p> : null}
      </div>
      {children}
    </div>
  );
}

function FieldError({ state }: { state: ConnectState }) {
  if (!state.error) return null;
  return <p className="type-body-sm text-alert">{state.error}</p>;
}

// Connect PG&E: a one-click authorization pull (the sample feed in v1) AND, as a variant,
// uploading a Green Button export. Both land real usage. PG&E is one option among equals,
// not a forced first step; the LOA "never upload a bill again" upsell is deliberately NOT
// placed here at the entry gate (AC5: it is an upgrade offered after value, a later
// post-confirm/settings surface). TODO(5.3+): add that post-value upsell.
function PgeCard({ farmId }: { farmId: string }) {
  const [state, action] = useActionState<ConnectState, FormData>(uploadGreenButtonAction, {});
  return (
    <Card title={t.pgeTitle} body={t.pgeBody}>
      <form action={connectPgeAction}>
        <input type="hidden" name="farmId" value={farmId} />
        <Button type="submit" variant="primary">
          {t.pgeCta}
        </Button>
      </form>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="farmId" value={farmId} />
        <input type="file" name="files" accept=".xml" multiple className="text-sm" />
        <Button type="submit" variant="secondary">
          {t.greenButtonCta}
        </Button>
        <FieldError state={state} />
      </form>
    </Card>
  );
}

// Upload bills: identity read off the bill, so printed fields are never re-typed (AC3).
function BillCard({ farmId }: { farmId: string }) {
  return (
    <Card title={t.billsTitle} body={t.billsBody}>
      <form action={uploadBillAction} className="flex flex-col gap-2">
        <input type="hidden" name="farmId" value={farmId} />
        <input type="file" name="bill" accept="image/*,application/pdf" className="text-sm" />
        <Button type="submit" variant="secondary">
          {t.billsCta}
        </Button>
      </form>
    </Card>
  );
}

// Upload meter list: inventory; not a real source on its own (does not unlock confirm).
function SpreadsheetCard({ farmId }: { farmId: string }) {
  const [state, action] = useActionState<ConnectState, FormData>(uploadSpreadsheetAction, {});
  return (
    <Card title={t.sheetTitle} body={t.sheetBody}>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="farmId" value={farmId} />
        <input type="file" name="sheet" accept=".csv,text/csv" className="text-sm" />
        <Button type="submit" variant="secondary">
          {t.sheetCta}
        </Button>
        <FieldError state={state} />
      </form>
    </Card>
  );
}
