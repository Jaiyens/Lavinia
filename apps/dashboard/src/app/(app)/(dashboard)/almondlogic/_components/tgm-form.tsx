"use client";

// Good-meats (TGM) entry surface: two customer-sourced paths side by side. LEFT: a manual figure the
// grower stands behind (block + variety + season + pounds). RIGHT: paste a Blue Diamond statement and
// let the ZDR pound-gate read + check it before anything is saved. Both call manager-gated Server
// Actions; the actions are the real security + validation gate, this is only the input surface. No
// pound is computed here. On success the page revalidates so the worksheet picks up the new figure.

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { en } from "@/copy/en";
import { recordManualTgmAction, ingestTgmStatementAction } from "@/lib/crops/tgm-actions";

const c = en.crops.worksheet.tgmForm;

export type BlockChoice = { id: string; name: string };

type Note = { ok: boolean; message: string } | null;

function BlockSelect({
  blocks,
  value,
  onChange,
  disabled,
}: {
  blocks: readonly BlockChoice[];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-9 w-full" aria-label={c.block}>
        <SelectValue placeholder={c.blockPlaceholder} />
      </SelectTrigger>
      <SelectContent>
        {blocks.map((b) => (
          <SelectItem key={b.id} value={b.id}>
            {b.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function SeasonSelect({
  seasons,
  value,
  onChange,
  disabled,
}: {
  seasons: readonly number[];
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger className="h-9 w-full tnum" aria-label={c.season}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {seasons.map((y) => (
          <SelectItem key={y} value={String(y)} className="tnum">
            {y}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="type-label-caps text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

export function TgmForm({
  blocks,
  seasons,
}: {
  blocks: readonly BlockChoice[];
  seasons: readonly number[];
}) {
  const defaultSeason = String(seasons[0] ?? new Date().getFullYear());

  // Manual card state.
  const [mSeason, setMSeason] = useState(defaultSeason);
  const [mBlock, setMBlock] = useState("");
  const [mVariety, setMVariety] = useState("");
  const [mPounds, setMPounds] = useState("");
  const [mNote, setMNote] = useState<Note>(null);
  const [mPending, mStart] = useTransition();

  // Statement card state.
  const [sSeason, setSSeason] = useState(defaultSeason);
  const [sBlock, setSBlock] = useState("");
  const [sPage, setSPage] = useState("");
  const [sNote, setSNote] = useState<Note>(null);
  const [sPending, sStart] = useTransition();

  function onManual(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const tgmLbs = Number(mPounds.replace(/,/g, ""));
    if (mPending || mBlock === "" || mVariety.trim() === "" || !Number.isFinite(tgmLbs)) return;
    mStart(async () => {
      const res = await recordManualTgmAction({
        cropYear: Number(mSeason),
        blockId: mBlock,
        variety: mVariety.trim(),
        tgmLbs: Math.round(tgmLbs),
      });
      if (res.ok) {
        setMNote({ ok: true, message: c.saved });
        setMVariety("");
        setMPounds("");
      } else {
        setMNote({ ok: false, message: res.error });
      }
    });
  }

  function onStatement(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sPending || sBlock === "" || sPage.trim() === "") return;
    sStart(async () => {
      const res = await ingestTgmStatementAction({
        cropYear: Number(sSeason),
        blockId: sBlock,
        page: sPage,
      });
      if (res.ok) {
        const msg =
          res.data.coverage === "reconciled" ? c.reconciled(res.data.written) : c.needsReview(res.data.written);
        setSNote({ ok: res.data.coverage === "reconciled", message: msg });
        setSPage("");
      } else {
        setSNote({ ok: false, message: res.error });
      }
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Manual entry */}
      <section
        aria-label={c.manualTitle}
        className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-6 shadow-e1"
      >
        <h2 className="type-title text-on-surface">{c.manualTitle}</h2>
        <p className="type-body-sm mt-1 text-on-surface-variant">{c.manualSubtitle}</p>
        <form onSubmit={onManual} className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={c.season}>
              <SeasonSelect seasons={seasons} value={mSeason} onChange={setMSeason} disabled={mPending} />
            </Field>
            <Field label={c.block}>
              <BlockSelect blocks={blocks} value={mBlock} onChange={setMBlock} disabled={mPending} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label={c.variety}
              value={mVariety}
              onChange={(e) => setMVariety(e.target.value)}
              placeholder={c.varietyPlaceholder}
              disabled={mPending}
              autoComplete="off"
            />
            <Input
              label={c.pounds}
              inputMode="numeric"
              value={mPounds}
              onChange={(e) => setMPounds(e.target.value)}
              placeholder="108,652"
              disabled={mPending}
              autoComplete="off"
              className="tnum"
            />
          </div>
          <div className="mt-1 flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={mPending || mBlock === "" || mVariety.trim() === "" || mPounds.trim() === ""}
              aria-busy={mPending}
            >
              {mPending ? c.saving : c.save}
            </Button>
            {mNote ? (
              <p
                className={mNote.ok ? "type-caption text-primary" : "type-caption text-destructive"}
                role="status"
                aria-live="polite"
              >
                {mNote.message}
              </p>
            ) : null}
          </div>
        </form>
      </section>

      {/* Statement paste */}
      <section
        aria-label={c.statementTitle}
        className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-6 shadow-e1"
      >
        <h2 className="type-title text-on-surface">{c.statementTitle}</h2>
        <p className="type-body-sm mt-1 text-on-surface-variant">{c.statementSubtitle}</p>
        <form onSubmit={onStatement} className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={c.season}>
              <SeasonSelect seasons={seasons} value={sSeason} onChange={setSSeason} disabled={sPending} />
            </Field>
            <Field label={c.block}>
              <BlockSelect blocks={blocks} value={sBlock} onChange={setSBlock} disabled={sPending} />
            </Field>
          </div>
          <label className="flex flex-col gap-1">
            <span className="type-label-caps text-on-surface-variant">{c.statementTitle}</span>
            <textarea
              value={sPage}
              onChange={(e) => setSPage(e.target.value)}
              placeholder={c.statementPlaceholder}
              disabled={sPending}
              rows={6}
              className="w-full resize-y rounded-[var(--radius-control)] border border-outline-variant bg-surface px-3 py-2 type-body-sm text-on-surface outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            />
          </label>
          <div className="mt-1 flex items-center gap-3">
            <Button
              type="submit"
              size="sm"
              disabled={sPending || sBlock === "" || sPage.trim() === ""}
              aria-busy={sPending}
            >
              {sPending ? c.extracting : c.extract}
            </Button>
            {sNote ? (
              <p
                className={sNote.ok ? "type-caption text-primary" : "type-caption text-destructive"}
                role="status"
                aria-live="polite"
              >
                {sNote.message}
              </p>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
