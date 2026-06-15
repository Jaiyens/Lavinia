"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";
import { defaultCenter } from "@/lib/onboarding/geocode";
import { saveConfirmationAction } from "../actions";
import { type MapPin, PinMap } from "./pin-map";
import { SubmitButton } from "./submit-button";

const c = en.onboarding.confirm;

// --- view models the server page hands in -------------------------------------

export type ConfirmPumpVM = {
  id: string;
  name: string;
  /** The farmer-editable choice the toggle sets. */
  kind: "pump" | "non_pump";
  /** What the data classified it as; the shown reason stays tied to this. */
  verdictKind: "pump" | "non_pump";
  /** True when the classifier was unsure, so the farmer should double-check. */
  unsure: boolean;
  blockTempIds: string[];
  latitude: number | null;
  longitude: number | null;
};
export type ConfirmBlockVM = {
  tempId: string;
  name: string;
  acreage: number | null;
  cropName: string | null;
};
export type ConfirmData = {
  farmId: string;
  farmName: string;
  pumps: ConfirmPumpVM[];
  blocks: ConfirmBlockVM[];
  crops: string[];
};

// --- mutable client state ------------------------------------------------------

type BlockState = { tempId: string; name: string; acreage: string; cropName: string };
type NewPumpState = {
  tempId: string;
  name: string;
  powerSource: "diesel" | "gas";
  horsepower: string;
  blockTempIds: string[];
  latitude: number;
  longitude: number;
};

function numOrNull(s: string): number | null {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) ? n : null;
}

export function ConfirmClient({
  data,
  saveAction = saveConfirmationAction,
}: {
  data: ConfirmData;
  // The server action the confirm form posts to. Defaults to the legacy onboarding save
  // (lands on /done); the Story 5.2 (app)/onboarding flow passes its own action that lands
  // on the dashboard. Both take the same hidden `payload` field.
  saveAction?: (formData: FormData) => Promise<void>;
}) {
  const seq = useRef(0);
  const nextId = (prefix: string) => `${prefix}-${seq.current++}`;

  const [farmName, setFarmName] = useState(data.farmName);
  const [pumps, setPumps] = useState<ConfirmPumpVM[]>(data.pumps);
  const [blocks, setBlocks] = useState<BlockState[]>(
    data.blocks.map((b) => ({
      tempId: b.tempId,
      name: b.name,
      acreage: b.acreage === null ? "" : String(b.acreage),
      cropName: b.cropName ?? "",
    })),
  );
  const [newPumps, setNewPumps] = useState<NewPumpState[]>([]);

  // A hand-added pump starts pinned here; the payload builder treats a pin still at
  // this exact spot (with no other input) as "untouched" and drops the row.
  const mapCenter = defaultCenter();

  // --- block helpers ---
  const addBlock = () =>
    setBlocks((bs) => [...bs, { tempId: nextId("blk"), name: "", acreage: "", cropName: "" }]);
  const setBlock = (tempId: string, patch: Partial<BlockState>) =>
    setBlocks((bs) => bs.map((b) => (b.tempId === tempId ? { ...b, ...patch } : b)));
  const removeBlock = (tempId: string) => {
    setBlocks((bs) => bs.filter((b) => b.tempId !== tempId));
    const drop = (ids: string[]) => ids.filter((t) => t !== tempId);
    setPumps((ps) => ps.map((p) => ({ ...p, blockTempIds: drop(p.blockTempIds) })));
    setNewPumps((ps) => ps.map((p) => ({ ...p, blockTempIds: drop(p.blockTempIds) })));
  };

  const toggleServe = (
    current: string[],
    tempId: string,
  ): string[] =>
    current.includes(tempId) ? current.filter((t) => t !== tempId) : [...current, tempId];

  const setPump = (id: string, patch: Partial<ConfirmPumpVM>) =>
    setPumps((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // --- new (manual) pumps ---
  const addNewPump = () => {
    setNewPumps((ps) => [
      ...ps,
      {
        tempId: nextId("np"),
        name: "",
        powerSource: "diesel",
        horsepower: "",
        blockTempIds: [],
        latitude: mapCenter.lat,
        longitude: mapCenter.lng,
      },
    ]);
  };
  const setNewPump = (tempId: string, patch: Partial<NewPumpState>) =>
    setNewPumps((ps) => ps.map((p) => (p.tempId === tempId ? { ...p, ...patch } : p)));
  const removeNewPump = (tempId: string) =>
    setNewPumps((ps) => ps.filter((p) => p.tempId !== tempId));

  // --- pin map ---
  const pins: MapPin[] = [
    ...pumps.map((p) => ({
      key: p.id,
      name: p.name || c.unnamedPump,
      lat: p.latitude,
      lng: p.longitude,
      kind: p.kind,
    })),
    ...newPumps.map((p) => ({
      key: p.tempId,
      name: p.name || c.unnamedNewPump,
      lat: p.latitude,
      lng: p.longitude,
      kind: "pump" as const,
    })),
  ];
  const onMove = (key: string, lat: number, lng: number) => {
    if (key.startsWith("np-")) setNewPump(key, { latitude: lat, longitude: lng });
    else setPump(key, { latitude: lat, longitude: lng });
  };

  // --- payload (computed each render; lives in a hidden field on submit) ---
  const namedBlocks = blocks.filter((b) => b.name.trim() !== "");
  const liveBlockIds = new Set(namedBlocks.map((b) => b.tempId));
  const keepServed = (ids: string[]) => ids.filter((t) => liveBlockIds.has(t));

  const payload = {
    farmId: data.farmId,
    farmName: farmName.trim() || undefined,
    blocks: namedBlocks.map((b) => ({
      tempId: b.tempId,
      name: b.name.trim(),
      acreage: numOrNull(b.acreage),
      cropName: b.cropName.trim() || null,
    })),
    pumps: pumps.map((p) => ({
      id: p.id,
      name: p.name.trim() || c.unnamedPump,
      kind: p.kind,
      // A meter the farmer marks "Not a pump" should not keep field links it can no
      // longer see or edit; drop them so they are not silently persisted.
      blockTempIds: p.kind === "pump" ? keepServed(p.blockTempIds) : [],
      latitude: p.latitude,
      longitude: p.longitude,
    })),
    // Keep a hand-entered pump if the farmer touched it at all (name, HP, a field, or
    // a dragged pin), defaulting only the name. Drop a row that was added and left
    // wholly untouched so an accidental "Add a pump" click does not persist junk.
    newPumps: newPumps
      .filter(
        (p) =>
          p.name.trim() !== "" ||
          p.horsepower.trim() !== "" ||
          p.blockTempIds.length > 0 ||
          p.latitude !== mapCenter.lat ||
          p.longitude !== mapCenter.lng,
      )
      .map((p) => ({
        name: p.name.trim() || c.unnamedNewPump,
        powerSource: p.powerSource,
        horsepower: numOrNull(p.horsepower),
        blockTempIds: keepServed(p.blockTempIds),
        latitude: p.latitude,
        longitude: p.longitude,
      })),
  };

  const fieldInput =
    "border-border bg-background focus:border-border-strong rounded-lg border px-3 py-2 text-sm outline-none";

  return (
    <form action={saveAction} className="space-y-10">
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      {/* Farm name */}
      <label className="flex flex-col gap-1.5">
        <span className="label-caps text-muted">{c.farmNameLabel}</span>
        <input
          value={farmName}
          onChange={(e) => setFarmName(e.target.value)}
          className={`${fieldInput} max-w-md text-base`}
        />
      </label>

      {/* Map overview */}
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-xl">{c.mapTitle}</h2>
          <p className="text-muted text-sm text-pretty">{c.mapHelp}</p>
        </div>
        <PinMap pins={pins} onMove={onMove} />
      </section>

      {/* Fields (blocks) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl">{c.fieldsTitle}</h2>
          <button
            type="button"
            onClick={addBlock}
            className="label-caps border-border-strong text-foreground hover:bg-foreground hover:text-background rounded-full border px-4 py-2 transition-colors"
          >
            + {c.addBlock}
          </button>
        </div>
        {blocks.length === 0 ? (
          <p className="text-faint text-sm">{c.noFieldsYet}</p>
        ) : (
          <div className="space-y-2">
            {blocks.map((b) => (
              <div
                key={b.tempId}
                className="border-border bg-card grid grid-cols-1 gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_6rem_1fr_auto]"
              >
                <input
                  aria-label={c.blockNameLabel}
                  placeholder={c.blockNameLabel}
                  value={b.name}
                  onChange={(e) => setBlock(b.tempId, { name: e.target.value })}
                  className={fieldInput}
                />
                <input
                  aria-label={c.blockAcresLabel}
                  placeholder={c.blockAcresLabel}
                  inputMode="decimal"
                  value={b.acreage}
                  onChange={(e) => setBlock(b.tempId, { acreage: e.target.value })}
                  className={fieldInput}
                />
                <input
                  aria-label={c.blockCropLabel}
                  placeholder={c.blockCropLabel}
                  list="crop-options"
                  value={b.cropName}
                  onChange={(e) => setBlock(b.tempId, { cropName: e.target.value })}
                  className={fieldInput}
                />
                <button
                  type="button"
                  onClick={() => removeBlock(b.tempId)}
                  className="label-caps text-faint hover:text-foreground px-2 transition-colors"
                >
                  {c.removeBlock}
                </button>
              </div>
            ))}
          </div>
        )}
        <datalist id="crop-options">
          {data.crops.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      </section>

      {/* Meters (imported pumps) */}
      <section className="space-y-3">
        <h2 className="font-display text-xl">{c.metersTitle}</h2>
        <div className="space-y-3">
          {pumps.map((p) => (
            <div key={p.id} className="border-border bg-card rounded-2xl border p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <label className="flex flex-1 flex-col gap-1.5">
                  <span className="label-caps text-muted">{c.meterNameLabel}</span>
                  <input
                    value={p.name}
                    onChange={(e) => setPump(p.id, { name: e.target.value })}
                    className={`${fieldInput} max-w-sm`}
                  />
                </label>
                <div className="flex shrink-0 gap-1 self-end sm:self-start">
                  {(["pump", "non_pump"] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPump(p.id, { kind: k })}
                      className={cn(
                        "label-caps rounded-full border px-3 py-1.5 transition-colors",
                        p.kind === k
                          ? "bg-foreground text-background border-transparent"
                          : "border-border text-muted hover:text-foreground",
                      )}
                    >
                      {k === "pump" ? c.kindPump : c.kindNonPump}
                    </button>
                  ))}
                </div>
              </div>

              <p className="text-faint mt-2 text-xs leading-relaxed text-pretty">
                {p.kind !== p.verdictKind
                  ? en.onboarding.classify.overridden
                  : p.unsure
                    ? en.onboarding.classify.unsure
                    : p.verdictKind === "pump"
                      ? en.onboarding.classify.pump
                      : en.onboarding.classify.nonPump}
              </p>

              {p.kind === "pump" ? (
                <div className="mt-4">
                  <span className="label-caps text-muted">{c.servesLabel}</span>
                  {namedBlocks.length === 0 ? (
                    <p className="text-faint mt-1 text-sm">{c.noFieldsYet}</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {namedBlocks.map((b) => {
                        const on = p.blockTempIds.includes(b.tempId);
                        return (
                          <button
                            key={b.tempId}
                            type="button"
                            onClick={() =>
                              setPump(p.id, {
                                blockTempIds: toggleServe(p.blockTempIds, b.tempId),
                              })
                            }
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-sm transition-colors",
                              on
                                ? "bg-accent/15 border-accent/40 text-foreground"
                                : "border-border text-muted hover:text-foreground",
                            )}
                          >
                            {b.name.trim()}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      {/* Manual diesel/gas pumps */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl">{c.addPump}</h2>
            <p className="text-muted text-sm text-pretty">{c.addPumpNote}</p>
          </div>
          <button
            type="button"
            onClick={addNewPump}
            className="label-caps border-border-strong text-foreground hover:bg-foreground hover:text-background shrink-0 rounded-full border px-4 py-2 transition-colors"
          >
            + {c.addPump}
          </button>
        </div>
        {newPumps.map((p) => (
          <div key={p.tempId} className="border-border bg-card space-y-3 rounded-2xl border p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem_6rem_auto]">
              <input
                aria-label={c.newPumpNameLabel}
                placeholder={c.newPumpNameLabel}
                value={p.name}
                onChange={(e) => setNewPump(p.tempId, { name: e.target.value })}
                className={fieldInput}
              />
              <select
                aria-label={c.newPumpPowerLabel}
                value={p.powerSource}
                onChange={(e) =>
                  setNewPump(p.tempId, { powerSource: e.target.value as "diesel" | "gas" })
                }
                className={fieldInput}
              >
                <option value="diesel">{c.powerDiesel}</option>
                <option value="gas">{c.powerGas}</option>
              </select>
              <input
                aria-label={c.newPumpHpLabel}
                placeholder={c.newPumpHpLabel}
                inputMode="decimal"
                value={p.horsepower}
                onChange={(e) => setNewPump(p.tempId, { horsepower: e.target.value })}
                className={fieldInput}
              />
              <button
                type="button"
                onClick={() => removeNewPump(p.tempId)}
                className="label-caps text-faint hover:text-foreground px-2 transition-colors"
              >
                {c.removeBlock}
              </button>
            </div>
            {namedBlocks.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {namedBlocks.map((b) => {
                  const on = p.blockTempIds.includes(b.tempId);
                  return (
                    <button
                      key={b.tempId}
                      type="button"
                      onClick={() =>
                        setNewPump(p.tempId, {
                          blockTempIds: toggleServe(p.blockTempIds, b.tempId),
                        })
                      }
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-sm transition-colors",
                        on
                          ? "bg-accent/15 border-accent/40 text-foreground"
                          : "border-border text-muted hover:text-foreground",
                      )}
                    >
                      {b.name.trim()}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <div className="border-border flex justify-end border-t pt-6">
        <SubmitButton label={c.save} pendingLabel={c.saving} />
      </div>
    </form>
  );
}
