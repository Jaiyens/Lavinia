"use client";

// Sales surface: an available-to-sell table (good meats on hand minus committed, per cropYear +
// variety) and an add-a-sale form. Every pound is summed by the pure engine (loadSalePositions ->
// salePositions); this only formats. The form calls a manager-gated Server Action; a forward sale
// beyond available is allowed but the result flags how much it oversells by. On success the page
// revalidates.

import { useState, useTransition } from "react";
import { en, num } from "@/copy/en";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SalePosition } from "@/lib/crops/sale";
import { createSaleAction } from "@/lib/crops/sale-actions";
import { FullscreenPanel } from "./fullscreen-panel";

const c = en.crops.worksheet.sales;

export type BlockChoice = { id: string; name: string };

const NONE = "__none__";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="type-label-caps text-on-surface-variant">{label}</span>
      {children}
    </label>
  );
}

export function SalesView({
  positions,
  blocks,
  seasons,
  canWrite,
}: {
  positions: readonly SalePosition[];
  blocks: readonly BlockChoice[];
  seasons: readonly number[];
  canWrite: boolean;
}) {
  return (
    <div className="flex flex-col gap-8">
      <FullscreenPanel label={c.title}>
      <div className="overflow-x-auto rounded-[var(--radius-control)] border border-outline-variant">
        <table className="w-full border-collapse type-body-sm">
          <caption className="sr-only">{c.table.caption}</caption>
          <thead>
            <tr className="border-b border-outline-variant type-label-caps text-on-surface-variant">
              <th scope="col" className="px-3 py-2 text-left tnum">{c.table.columns.year}</th>
              <th scope="col" className="px-3 py-2 text-left">{c.table.columns.variety}</th>
              <th scope="col" className="px-3 py-2 text-right">{c.table.columns.ngm}</th>
              <th scope="col" className="px-3 py-2 text-right">{c.table.columns.committed}</th>
              <th scope="col" className="px-3 py-2 text-right">{c.table.columns.available}</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center type-body-md text-on-surface-variant">
                  {c.table.empty}
                </td>
              </tr>
            ) : (
              positions.map((p) => (
                <tr key={`${p.cropYear} ${p.variety}`} className="border-b border-outline-variant/40 last:border-0">
                  <td className="px-3 py-2 text-left tnum text-on-surface">{p.cropYear}</td>
                  <td className="px-3 py-2 text-left text-on-surface-variant">{p.variety}</td>
                  <td className="px-3 py-2 text-right tnum text-on-surface">{num(p.ngmLbs)}</td>
                  <td className="px-3 py-2 text-right tnum text-on-surface">{num(p.committedLbs)}</td>
                  <td className={cn("px-3 py-2 text-right tnum", p.availableLbs < 0 ? "text-destructive" : "text-on-surface")}>
                    <span className="inline-flex items-center gap-2">
                      {num(p.availableLbs)}
                      {p.availableLbs < 0 ? (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">{c.table.oversold}</Badge>
                      ) : null}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </FullscreenPanel>

      {canWrite ? <SaleForm blocks={blocks} seasons={seasons} /> : null}
    </div>
  );
}

function SaleForm({ blocks, seasons }: { blocks: readonly BlockChoice[]; seasons: readonly number[] }) {
  const [season, setSeason] = useState(String(seasons[0] ?? new Date().getFullYear()));
  const [variety, setVariety] = useState("");
  const [buyer, setBuyer] = useState("");
  const [pounds, setPounds] = useState("");
  const [price, setPrice] = useState("");
  const [blockId, setBlockId] = useState(NONE);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const lbs = Number(pounds.replace(/,/g, ""));
    if (pending || variety.trim() === "" || buyer.trim() === "" || !Number.isFinite(lbs)) return;
    // Price is dollars/lb in the field; convert to integer cents/lb. Blank -> pounds-only. A
    // malformed price surfaces the calm invalid note instead of silently doing nothing.
    const priceStr = price.replace(/,/g, "").trim();
    const priceCentsPerPound = priceStr === "" ? null : Math.round(Number(priceStr) * 100);
    if (priceCentsPerPound !== null && !Number.isFinite(priceCentsPerPound)) {
      setNote({ ok: false, message: c.invalid });
      return;
    }
    start(async () => {
      const res = await createSaleAction({
        cropYear: Number(season),
        variety: variety.trim(),
        buyer: buyer.trim(),
        pounds: Math.round(lbs),
        priceCentsPerPound,
        blockId: blockId === NONE ? null : blockId,
      });
      if (res.ok) {
        setNote({
          ok: res.data.oversoldBy === 0,
          message: res.data.oversoldBy === 0 ? c.saved : c.savedOversold(num(res.data.oversoldBy)),
        });
        setPounds("");
        setPrice("");
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
        <Input label={c.variety} value={variety} onChange={(e) => setVariety(e.target.value)} placeholder={c.varietyPlaceholder} disabled={pending} autoComplete="off" />
        <Input label={c.buyer} value={buyer} onChange={(e) => setBuyer(e.target.value)} placeholder={c.buyerPlaceholder} disabled={pending} autoComplete="off" />
        <Input label={c.pounds} inputMode="numeric" value={pounds} onChange={(e) => setPounds(e.target.value)} placeholder="100,000" disabled={pending} autoComplete="off" className="tnum" />
        <Input label={c.price} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="2.15" disabled={pending} autoComplete="off" className="tnum" />
        <Field label={c.block}>
          <Select value={blockId} onValueChange={setBlockId} disabled={pending}>
            <SelectTrigger className="h-9 w-full"><SelectValue placeholder={c.blockPlaceholder} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{c.blockPlaceholder}</SelectItem>
              {blocks.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-center gap-3 sm:col-span-2 lg:col-span-3">
          <Button
            type="submit"
            size="sm"
            disabled={pending || variety.trim() === "" || buyer.trim() === "" || pounds.trim() === ""}
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
      <p className="mt-2 type-caption text-on-surface-variant">{c.priceHint}</p>
    </section>
  );
}
