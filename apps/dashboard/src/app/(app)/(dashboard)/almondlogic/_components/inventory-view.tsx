"use client";

// Good-meats inventory surface: stage tiles (RAW / STOCKPILE / MEATS on hand) + a filterable
// positions table + an append-only add/remove form. Every pound is summed by the pure engine
// (loadInventory -> inventoryPositions); this only formats and filters (the table filter is
// client-side over the already-rolled-up positions). The add form calls a manager-gated Server
// Action; the action is the real gate. On success the page revalidates.

import { useMemo, useState, useTransition } from "react";
import { en, num } from "@/copy/en";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { INVENTORY_STAGES, type InventoryPosition, type InventoryStage } from "@/lib/crops/inventory";
import { addInventoryAdjustmentAction } from "@/lib/crops/inventory-actions";

const c = en.crops.worksheet.inventory;

export type BlockChoice = { id: string; name: string };

const STAGE_LABEL: Record<InventoryStage, string> = {
  RAW: c.stageRaw,
  STOCKPILE: c.stageStockpile,
  MEATS: c.stageMeats,
};

const ALL = "__all__";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="type-label-caps text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

export function InventoryView({
  positions,
  totals,
  facets,
  blocks,
  seasons,
  canWrite,
}: {
  positions: readonly InventoryPosition[];
  totals: Record<InventoryStage, number>;
  facets: { packers: string[]; varieties: string[] };
  blocks: readonly BlockChoice[];
  seasons: readonly number[];
  canWrite: boolean;
}) {
  // Table filters (client-side over the rolled-up positions).
  const [fPacker, setFPacker] = useState(ALL);
  const [fVariety, setFVariety] = useState(ALL);
  const [fStage, setFStage] = useState(ALL);

  const filtered = useMemo(
    () =>
      positions.filter(
        (p) =>
          (fPacker === ALL || (p.packer ?? "") === fPacker) &&
          (fVariety === ALL || p.variety === fVariety) &&
          (fStage === ALL || p.stage === fStage),
      ),
    [positions, fPacker, fVariety, fStage],
  );

  return (
    <div className="flex flex-col gap-8">
      {/* Stage tiles: overall on-hand by stage (unfiltered headline). */}
      <div className="grid gap-4 sm:grid-cols-3">
        {INVENTORY_STAGES.map((s) => (
          <Card key={s} className="gap-0 rounded-[var(--radius-control)] p-5">
            <span className="type-label-caps text-on-surface-variant">{c.stageTotalLabel(STAGE_LABEL[s])}</span>
            <span className="type-headline mt-1 tnum text-on-surface">{num(totals[s])}</span>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <Field label={c.filterPacker}>
          <Select value={fPacker} onValueChange={setFPacker}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{c.filterAll}</SelectItem>
              {facets.packers.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={c.filterVariety}>
          <Select value={fVariety} onValueChange={setFVariety}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{c.filterAll}</SelectItem>
              {facets.varieties.map((v) => (
                <SelectItem key={v} value={v}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={c.filterStage}>
          <Select value={fStage} onValueChange={setFStage}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{c.filterAll}</SelectItem>
              {INVENTORY_STAGES.map((s) => (
                <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {/* Positions table */}
      <div className="overflow-x-auto rounded-[var(--radius-control)] border border-outline-variant">
        <table className="w-full border-collapse type-body-sm">
          <caption className="sr-only">{c.table.caption}</caption>
          <thead>
            <tr className="border-b border-outline-variant type-label-caps text-on-surface-variant">
              <th scope="col" className="px-3 py-2 text-left">{c.table.columns.packer}</th>
              <th scope="col" className="px-3 py-2 text-left">{c.table.columns.block}</th>
              <th scope="col" className="px-3 py-2 text-left">{c.table.columns.variety}</th>
              <th scope="col" className="px-3 py-2 text-left">{c.table.columns.stage}</th>
              <th scope="col" className="px-3 py-2 text-right">{c.table.columns.onHand}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center type-body-md text-on-surface-variant">
                  {c.table.empty}
                </td>
              </tr>
            ) : (
              filtered.map((p) => (
                <tr key={`${p.packer ?? ""}|${p.blockId ?? ""}|${p.variety}|${p.stage}`} className="border-b border-outline-variant/40 last:border-0">
                  <td className="px-3 py-2 text-left text-on-surface">{p.packer ?? c.table.noPacker}</td>
                  <td className="px-3 py-2 text-left text-on-surface">{p.blockName ?? c.table.unassigned}</td>
                  <td className="px-3 py-2 text-left text-on-surface-variant">{p.variety}</td>
                  <td className="px-3 py-2 text-left text-on-surface-variant">{STAGE_LABEL[p.stage]}</td>
                  <td className="px-3 py-2 text-right tnum text-on-surface">{num(p.onHandLbs)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {canWrite ? <InventoryForm blocks={blocks} seasons={seasons} /> : null}
    </div>
  );
}

function InventoryForm({ blocks, seasons }: { blocks: readonly BlockChoice[]; seasons: readonly number[] }) {
  const [season, setSeason] = useState(String(seasons[0] ?? new Date().getFullYear()));
  const [blockId, setBlockId] = useState(ALL);
  const [variety, setVariety] = useState("");
  const [packer, setPacker] = useState("");
  const [stage, setStage] = useState<InventoryStage>("MEATS");
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amountLbs = Number(amount.replace(/,/g, ""));
    if (pending || variety.trim() === "" || reason.trim() === "" || !Number.isFinite(amountLbs)) return;
    start(async () => {
      const res = await addInventoryAdjustmentAction({
        cropYear: Number(season),
        blockId: blockId === ALL ? null : blockId,
        variety: variety.trim(),
        packer: packer.trim() === "" ? null : packer.trim(),
        stage,
        amountLbs: Math.round(amountLbs),
        direction,
        reason: reason.trim(),
      });
      if (res.ok) {
        setNote({ ok: true, message: c.saved });
        setAmount("");
        setReason("");
      } else {
        setNote({ ok: false, message: res.error });
      }
    });
  }

  return (
    <section
      aria-label={c.addTitle}
      className="rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-6 shadow-e1"
    >
      <h2 className="type-title text-on-surface">{c.addTitle}</h2>
      <p className="type-body-sm mt-1 text-on-surface-variant">{c.addSubtitle}</p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={c.season}>
          <Select value={season} onValueChange={setSeason} disabled={pending}>
            <SelectTrigger className="h-9 w-full tnum"><SelectValue /></SelectTrigger>
            <SelectContent>
              {seasons.map((y) => (
                <SelectItem key={y} value={String(y)} className="tnum">{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={c.block}>
          <Select value={blockId} onValueChange={setBlockId} disabled={pending}>
            <SelectTrigger className="h-9 w-full"><SelectValue placeholder={c.blockPlaceholder} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{c.table.unassigned}</SelectItem>
              {blocks.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label={c.stage}>
          <Select value={stage} onValueChange={(v) => setStage(v as InventoryStage)} disabled={pending}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INVENTORY_STAGES.map((s) => (
                <SelectItem key={s} value={s}>{STAGE_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Input label={c.variety} value={variety} onChange={(e) => setVariety(e.target.value)} placeholder={c.varietyPlaceholder} disabled={pending} autoComplete="off" />
        <Input label={c.packer} value={packer} onChange={(e) => setPacker(e.target.value)} placeholder={c.packerPlaceholder} disabled={pending} autoComplete="off" />
        <Field label={c.direction}>
          <Select value={direction} onValueChange={(v) => setDirection(v as "add" | "remove")} disabled={pending}>
            <SelectTrigger className="h-9 w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="add">{c.directionAdd}</SelectItem>
              <SelectItem value="remove">{c.directionRemove}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Input label={c.amount} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="40,000" disabled={pending} autoComplete="off" className="tnum" />
        <div className="sm:col-span-2">
          <Input label={c.reason} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={c.reasonPlaceholder} disabled={pending} autoComplete="off" />
        </div>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
          <Button
            type="submit"
            size="sm"
            disabled={pending || variety.trim() === "" || amount.trim() === "" || reason.trim() === ""}
            aria-busy={pending}
          >
            {pending ? c.saving : c.save}
          </Button>
          {note ? (
            <p className={cn("type-caption", note.ok ? "text-primary" : "text-destructive")} role="status" aria-live="polite">
              {note.message}
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
