"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { en, lbs } from "@/copy/en";
import { mapFieldToBlockAction } from "../(dashboard)/almondlogic/crop-actions";

// The field -> block mapping UI (WS1): one row per distinct Almond Logic delivery field, each with
// the field's total delivered pounds and a shadcn Select of the farm's blocks (plus "Unmapped"). A
// change calls mapFieldToBlockAction (writer-gated server-side); on success the revalidated shell
// re-renders the cost page + headline with the new attribution, so an unmapped field's pounds leave
// the residual line and join its block's energy cost. Every pound is precomputed (fieldWeights);
// this component only formats and dispatches. A viewer is read-only (the action refuses, and we show
// the read-only note instead of the dropdowns).

const t = en.crops.cost.map;

export type FieldWeight = { field: string; netLb: number };
export type BlockOption = { id: string; name: string };

// The Select cannot carry an empty-string value, so "Unmapped" gets this sentinel; it maps back to
// null (delete the mapping) when dispatched.
const UNMAPPED = "__unmapped__";

function FieldRow({
  field,
  netLb,
  blocks,
  initialBlockId,
}: {
  field: string;
  netLb: number;
  blocks: BlockOption[];
  initialBlockId: string | null;
}) {
  const [value, setValue] = useState<string>(initialBlockId ?? UNMAPPED);
  const [isPending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  const onChange = (next: string) => {
    const prev = value;
    setValue(next);
    setFailed(false);
    const blockId = next === UNMAPPED ? null : next;
    startTransition(async () => {
      try {
        const result = await mapFieldToBlockAction(field, blockId);
        if (!result.ok) {
          setFailed(true);
          setValue(prev); // roll back the optimistic selection on a refused write
        }
      } catch {
        setFailed(true);
        setValue(prev);
      }
    });
  };

  return (
    <Card className="gap-3 rounded-[var(--radius-control)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="type-num font-medium text-on-surface">{t.fieldLabel(field)}</p>
          <p className="type-caption text-on-surface-variant">{t.fieldWeight(lbs(netLb))}</p>
        </div>
        <Select value={value} onValueChange={onChange} disabled={isPending}>
          <SelectTrigger className="h-11 w-auto min-w-[12rem]" aria-label={t.selectAria(field)}>
            <SelectValue placeholder={t.selectPlaceholder} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={UNMAPPED}>{t.unmapped}</SelectItem>
            {blocks.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {isPending && <p className="type-caption text-on-surface-variant">{t.saving}</p>}
      {failed && (
        <Alert variant="destructive">
          <AlertDescription>{t.saveError}</AlertDescription>
        </Alert>
      )}
    </Card>
  );
}

export function CropFieldBlockMap({
  fieldWeights,
  blocks,
  fieldBlockMap,
  readOnly,
}: {
  fieldWeights: FieldWeight[];
  blocks: BlockOption[];
  /** field -> blockId for fields already mapped (the dropdown's initial value). */
  fieldBlockMap: Record<string, string>;
  readOnly: boolean;
}) {
  return (
    <section aria-label={t.title}>
      <header className="mb-3">
        <h2 className="type-headline text-on-surface">{t.title}</h2>
        <p className="mt-1 type-body-sm text-on-surface-variant">{t.subtitle}</p>
        {readOnly && (
          <p className="mt-1 type-caption text-on-surface-variant">{t.readOnly}</p>
        )}
      </header>
      {fieldWeights.length === 0 ? (
        <div className="flex min-h-[8rem] flex-col items-center justify-center rounded-[var(--radius-lg)] border border-outline-variant bg-surface-container-lowest p-6">
          <p className="type-body-md text-on-surface-variant">{t.empty}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {fieldWeights.map((fw) => (
            <li key={fw.field}>
              {readOnly ? (
                <Card className="flex-row items-center justify-between gap-3 rounded-[var(--radius-control)] p-4">
                  <div className="min-w-0">
                    <p className="type-num font-medium text-on-surface">{t.fieldLabel(fw.field)}</p>
                    <p className="type-caption text-on-surface-variant">{t.fieldWeight(lbs(fw.netLb))}</p>
                  </div>
                  <span className="type-caption text-on-surface-variant">
                    {fieldBlockMap[fw.field]
                      ? (blocks.find((b) => b.id === fieldBlockMap[fw.field])?.name ?? t.unmapped)
                      : t.unmapped}
                  </span>
                </Card>
              ) : (
                <FieldRow
                  field={fw.field}
                  netLb={fw.netLb}
                  blocks={blocks}
                  initialBlockId={fieldBlockMap[fw.field] ?? null}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
