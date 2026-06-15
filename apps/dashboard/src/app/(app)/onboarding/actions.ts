"use server";

// Server-action edge for the Story 5.2 connect-a-source onboarding. Operator-operable and
// auth-gated: every action re-checks auth() (a Server Action is independently reachable,
// per Story 5.1) and attaches the new farm to the signed-in operator (Farm.userId). Thin
// wrappers over the testable lib edges in onboarding/farm.ts + onboarding/sources.ts.

import { redirect } from "next/navigation";
import { sessionUserId } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  createFarmFromConnection,
  parseConfirmationPayload,
  saveConfirmation,
} from "@/lib/onboarding/farm";
import {
  addGreenButtonFiles,
  addPgeFeed,
  addSpreadsheet,
  importBillUpload,
} from "@/lib/onboarding/sources";
import { runEngines } from "@/lib/recommendations/run";

const CONNECT = "/onboarding/connect";

function field(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** Identify the farm (name + contact) and open the source picker. Creates the farm up
 *  front so sources accumulate into one farm and it is owned by the operator. */
export async function identifyFarmAction(formData: FormData): Promise<void> {
  const userId = await sessionUserId();
  if (!userId) redirect("/login");
  const name = field(formData, "farmName");
  const ownerName = field(formData, "ownerName");
  const ownerEmail = field(formData, "ownerEmail");
  const { farmId } = await createFarmFromConnection(prisma, {
    name: name ?? undefined,
    ownerName: ownerName ?? undefined,
  });
  await prisma.farm.update({ where: { id: farmId }, data: { userId } });
  if (ownerEmail) {
    // createFarmFromConnection makes the owner Person only when a name was given. If the
    // operator gave an email but no name, that update would match nothing and the email
    // would be lost, so create the owner here when one does not exist yet.
    const updated = await prisma.person.updateMany({
      where: { farmId, role: "owner" },
      data: { email: ownerEmail },
    });
    if (updated.count === 0) {
      await prisma.person.create({
        data: { farmId, name: ownerName ?? "Owner", email: ownerEmail, role: "owner", language: "en" },
      });
    }
  }
  redirect(`${CONNECT}?farm=${farmId}`);
}

/** Confirm the operator owns the in-progress farm before mutating it. */
async function ownsFarm(farmId: string, userId: string): Promise<boolean> {
  const farm = await prisma.farm.findFirst({ where: { id: farmId, userId } });
  return farm !== null;
}

export type ConnectState = { error?: string };

/** Connect PG&E authorization: pull the (sample) Green Button feed into the farm. The
 *  real-source path that unlocks confirm. */
export async function connectPgeAction(formData: FormData): Promise<void> {
  const userId = await sessionUserId();
  const farmId = field(formData, "farmId");
  if (!userId || !farmId || !(await ownsFarm(farmId, userId))) redirect("/login");
  await addPgeFeed(prisma, farmId);
  redirect(`${CONNECT}?farm=${farmId}`);
}

/** Upload one or more Green Button (.xml) exports into the farm. */
export async function uploadGreenButtonAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const userId = await sessionUserId();
  const farmId = field(formData, "farmId");
  // A lost/expired session redirects to sign-in rather than failing silently (the
  // useActionState form cannot otherwise surface an auth failure).
  if (!userId || !farmId || !(await ownsFarm(farmId, userId))) redirect("/login");
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { error: "Add at least one PG&E export (.xml) file." };
  let imported: number;
  try {
    const xmls = await Promise.all(files.map((f) => f.text()));
    imported = await addGreenButtonFiles(prisma, farmId, xmls);
  } catch {
    return { error: "We could not read that file. It should be a PG&E Green Button XML export." };
  }
  if (imported === 0) {
    return { error: "We could not find any meters in that file. It should be a PG&E Green Button XML export." };
  }
  redirect(`${CONNECT}?farm=${farmId}`);
}

/** Upload the master meter list (CSV). Inventory, not a real source on its own (AC2). */
export async function uploadSpreadsheetAction(
  _prev: ConnectState,
  formData: FormData,
): Promise<ConnectState> {
  const userId = await sessionUserId();
  const farmId = field(formData, "farmId");
  if (!userId || !farmId || !(await ownsFarm(farmId, userId))) redirect("/login");
  const file = formData
    .getAll("sheet")
    .find((f): f is File => f instanceof File && f.size > 0);
  if (!file) return { error: "Add your meter list as a CSV file." };
  try {
    const csv = await file.text();
    const added = await addSpreadsheet(prisma, farmId, csv);
    if (added === 0) {
      return { error: "We could not find any meters in that sheet. The first row should be column headers." };
    }
  } catch {
    return { error: "We could not read that file. Save your spreadsheet as CSV and try again." };
  }
  redirect(`${CONNECT}?farm=${farmId}`);
}

/** Upload a bill (C3 / FR-2). With an AI Gateway key configured, run the REAL scanned-bill
 *  extraction over the PDF so the bill lands reconciled figures (a genuine real source);
 *  without one (dev/CI), fall back to reading only the printed identity so the flow still
 *  walks offline with zero external calls. Either way the grower never types the
 *  address/city/zip/phone printed on the bill (AC3). */
export async function uploadBillAction(formData: FormData): Promise<void> {
  const userId = await sessionUserId();
  const farmId = field(formData, "farmId");
  if (!userId || !farmId || !(await ownsFarm(farmId, userId))) redirect("/login");
  // Require an actual file: without this guard a click with no file selected (or a
  // double-click) would re-run the import on nothing. Bounce back when nothing was attached.
  const file = formData
    .getAll("bill")
    .find((f): f is File => f instanceof File && f.size > 0);
  if (!file) redirect(`${CONNECT}?farm=${farmId}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The onboarding edge owns the source boundary: real extraction when a Gateway key is
  // present, identity-only fallback otherwise. The screen never touches the extract layer.
  await importBillUpload(prisma, farmId, bytes);
  redirect(`${CONNECT}?farm=${farmId}`);
}

/** Persist the confirm step (payload is JSON in a hidden field) and land on the dashboard
 *  with findings. Reuses the shared saveConfirmation edge; differs from the legacy action
 *  only in landing on "/" instead of the legacy /done. */
export async function saveConfirmationAction(formData: FormData): Promise<void> {
  const userId = await sessionUserId();
  if (!userId) redirect("/login");
  const raw = formData.get("payload");
  if (typeof raw !== "string") throw new Error("Missing confirmation payload");
  const payload = parseConfirmationPayload(JSON.parse(raw));
  if (!(await ownsFarm(payload.farmId, userId))) redirect("/login");
  const { farmId, alreadyFinalized } = await saveConfirmation(prisma, payload);
  if (!alreadyFinalized) await runEngines(prisma, farmId);
  redirect("/");
}
