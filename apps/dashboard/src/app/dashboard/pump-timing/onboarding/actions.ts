"use server";

// Server-action edge for onboarding. Thin wrappers over the testable DB functions
// in src/lib/onboarding/farm.ts: they read the form, call the lib with the prisma
// singleton, and redirect. Keeping the logic in the lib lets the integration test
// exercise it without Next.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  type Readiness,
  type RevealCounts,
  connectGreenButtonUpload,
  connectManual,
  connectSpreadsheet,
  connectSampleFeed,
  finishPgeConnection,
  parseConfirmationPayload,
  pgeReadiness,
  pgeReveal,
  saveConfirmation,
  startPgeConnection,
} from "@/lib/onboarding/farm";
import { runEngines } from "@/lib/recommendations/run";
import { topFinding } from "@/lib/recommendations/top-finding";
import { type BillScanResult, readBillPhoto } from "@/lib/onboarding/vision";
import { type FindingView, recToFindingView } from "../_components/finding-view";

const ONBOARDING = "/dashboard/pump-timing/onboarding";

function field(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
}

/** "Connect PG&E": pull the sample feed, import, classify, go to confirm. */
export async function connectSampleAction(): Promise<void> {
  const { farmId } = await connectSampleFeed(prisma);
  redirect(`${ONBOARDING}/confirm?farm=${farmId}`);
}

/** Upload one or more PG&E Green Button XML exports: parse every service point, build
 * the farm, then go to the confirm step. Returns an error string (not a throw) so the
 * upload card can show why a file was rejected. */
export type UploadState = { error?: string };

export async function connectGreenButtonAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return { error: "Add at least one PG&E data export (.xml) file." };
  }
  let farmId: string;
  try {
    const xmls = await Promise.all(files.map((f) => f.text()));
    const res = await connectGreenButtonUpload(prisma, {
      xmls,
      name: field(formData, "farmName") ?? undefined,
    });
    if (res.pumps === 0) {
      return {
        error:
          "We could not find any meters in that file. It should be a PG&E Green Button XML export.",
      };
    }
    farmId = res.farmId;
  } catch {
    return {
      error:
        "We could not read that file. It should be a PG&E Green Button XML export (.xml).",
    };
  }
  redirect(`${ONBOARDING}/confirm?farm=${farmId}`);
}

/** Upload the grower's master meter list (CSV): create the farm with every entity,
 * account, and meter from the sheet, then go to the confirm step. Returns an error
 * string (not a throw) so the upload card can show why a file was rejected. */
export async function connectSpreadsheetAction(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const file = formData
    .getAll("sheet")
    .find((f): f is File => f instanceof File && f.size > 0);
  if (!file) return { error: "Add your meter list as a CSV file." };
  let farmId: string;
  try {
    const csv = await file.text();
    const res = await connectSpreadsheet(prisma, {
      csv,
      name: field(formData, "farmName") ?? undefined,
    });
    if (res.pumps === 0) {
      return {
        error:
          "We could not find any meters in that sheet. Make sure the first row has column headers (account, service id, rate, ...).",
      };
    }
    farmId = res.farmId;
  } catch {
    return { error: "We could not read that file. Save your spreadsheet as CSV and try again." };
  }
  redirect(`${ONBOARDING}/confirm?farm=${farmId}`);
}

// --- the live PG&E connect flow (UtilityAPI by default; Bayou behind PGE_PROVIDER) ---

/** Success carries what the client needs to open the authorization page; failure
 * carries the real reason (e.g. a missing token or wrong environment) so the UI can
 * show it instead of a generic message. */
export type StartConnectionState =
  | {
      ok: true;
      farmId: string;
      /** Hosted authorization page to open (UtilityAPI form, or Bayou's hosted link). */
      redirectUrl: string;
      /** True when an existing session was reused (Bayou): skip the sign-in page. */
      alreadyAuthenticated: boolean;
    }
  | { ok: false; error: string };

/**
 * Start a live PG&E connection with the configured provider. On success, returns the
 * hosted authorization url the client opens (the grower signs in to PG&E there, never in
 * Terra). On failure, returns the error message rather than throwing, so the connect
 * screen can surface it (thrown server-action errors get sanitized away).
 */
export async function startConnectionAction(
  opts: { forceNew?: boolean } = {},
): Promise<StartConnectionState> {
  try {
    const { farmId, redirectUrl, alreadyAuthenticated } = await startPgeConnection(prisma, {
      forceNew: opts.forceNew,
    });
    return { ok: true, farmId, redirectUrl, alreadyAuthenticated };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not start the connection.",
    };
  }
}

/** Poll where a farm's pull stands (read-only). The legacy pending screen calls this. */
export async function connectionStatusAction(farmId: string): Promise<Readiness> {
  return pgeReadiness(prisma, farmId);
}

/**
 * Finish the connection once the data is ready: import, run the engines so the home
 * screen has findings, then show the results screen. A no-op (returns false) if the
 * data is not ready yet, so the poller keeps waiting.
 */
export async function finishConnectionAction(farmId: string): Promise<boolean> {
  const result = await finishPgeConnection(prisma, farmId);
  if (!result) return false;
  await runEngines(prisma, farmId);
  // Bust the client router cache so the dashboard shows this farm, not a stale one.
  revalidatePath("/dashboard/pump-timing");
  redirect(`${ONBOARDING}/connected?farm=${farmId}`);
}

/**
 * "Continue with what's ready": import whatever the provider has so far (force), so a
 * slow collection does not strand the grower on the waiting screen. Runs the engines and
 * lands on the results screen.
 */
export async function continueWithReadyAction(farmId: string): Promise<void> {
  const result = await finishPgeConnection(prisma, farmId, { force: true });
  if (result) await runEngines(prisma, farmId);
  revalidatePath("/dashboard/pump-timing");
  redirect(`${ONBOARDING}/connected?farm=${farmId}`);
}

// --- the rebuilt reveal -> finding -> save flow ---------------------------------

/** Poll the live counts for the reveal screen (accounts, meters, bills). Read-only. */
export async function connectionRevealAction(farmId: string): Promise<RevealCounts> {
  return pgeReveal(prisma, farmId);
}

/** The reveal's finding payload: the dollar hero, plus whether it is a badged sample. */
export type RevealFinish = { finding: FindingView | null; sample: boolean };

/** The farm's own top pending finding, mapped to the card's view, or null. */
async function topFindingForFarm(farmId: string): Promise<FindingView | null> {
  const recs = await prisma.recommendation.findMany({
    where: { farmId, status: "pending" },
  });
  const top = topFinding(recs);
  return top ? recToFindingView(top) : null;
}

/**
 * A finding from the seeded demo (Batth) AG farm, the fallback when a real connection
 * has nothing to show yet. The Speculoos sandbox bills a residential tariff, so its
 * engines emit no rate finding; rather than show the farmer an empty result, we surface
 * the demo farm's top finding, badged "Sample finding" so a synthetic dollar is never
 * mistaken for their own. Real PG&E ag data shows the real finding, unbadged.
 */
async function sampleFinding(): Promise<FindingView | null> {
  const demo = await prisma.farm.findFirst({
    where: { isDemo: true },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  if (!demo) return null;
  let recs = await prisma.recommendation.findMany({
    where: { farmId: demo.id, status: "pending" },
  });
  if (recs.length === 0) {
    // Demo farm never had the engines run (fresh db): run them once so the fallback
    // has something to show.
    await runEngines(prisma, demo.id);
    recs = await prisma.recommendation.findMany({
      where: { farmId: demo.id, status: "pending" },
    });
  }
  const top = topFinding(recs);
  return top ? recToFindingView(top) : null;
}

/**
 * Finish a live connection and hand back the single biggest finding for the reveal's
 * finding screen. Imports + runs the engines (idempotent), then reads the farm's own top
 * finding; when there is none yet, falls back to a badged sample finding so the screen is
 * never empty. Returns null when the data is not ready and not forced, so the reveal
 * keeps polling. Unlike finishConnectionAction it does NOT redirect: the reveal machine
 * cross-fades reveal -> finding in place.
 */
export async function finishRevealAction(
  farmId: string,
  opts?: { force?: boolean },
): Promise<RevealFinish | null> {
  const result = await finishPgeConnection(
    prisma,
    farmId,
    opts?.force ? { force: true } : {},
  );
  if (!result) return null; // not ready yet; the poller keeps waiting
  await runEngines(prisma, farmId);
  revalidatePath("/dashboard/pump-timing");

  const real = await topFindingForFarm(farmId);
  if (real) return { finding: real, sample: false };
  return { finding: await sampleFinding(), sample: true };
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Save the owner at the end of the reveal: one Person{role:"owner"} with their name and
 * email (no password), then land on the home screen. The connection is already active
 * (finishRevealAction ran the import + engines), so this neither flips it nor re-runs.
 */
export async function saveOwnerAction(formData: FormData): Promise<void> {
  const farmId = field(formData, "farmId");
  const name = field(formData, "name");
  const email = field(formData, "email");
  if (!farmId) throw new Error("Missing farm");
  if (!name) throw new Error("A name is required");
  if (!email || !EMAIL_RE.test(email)) throw new Error("A valid email is required");

  await prisma.person.create({
    data: { farmId, name, email, role: "owner", language: "en" },
  });
  revalidatePath("/dashboard/pump-timing");
  redirect("/dashboard/pump-timing");
}

/** Manual / bill-scan path: create the farm with one hand-entered pump. */
export async function connectManualAction(formData: FormData): Promise<void> {
  const name = field(formData, "name");
  if (!name) throw new Error("A pump name is required");
  const { farmId } = await connectManual(prisma, {
    farmName: field(formData, "farmName") ?? undefined,
    pump: {
      name,
      serviceId: field(formData, "serviceId"),
      meterSerial: field(formData, "meterSerial"),
      rateSchedule: field(formData, "rateSchedule"),
      billingSerial: field(formData, "billingSerial"),
      location: field(formData, "location"),
    },
  });
  redirect(`${ONBOARDING}/confirm?farm=${farmId}`);
}

export type ScanState = { result?: BillScanResult; error?: string };

/** Read an uploaded bill photo into fields that pre-fill the manual form. */
export async function scanBillAction(
  _prev: ScanState,
  _formData: FormData,
): Promise<ScanState> {
  // The stub ignores the bytes; the real vision model will read _formData's file.
  const result = await readBillPhoto();
  return { result };
}

/** Persist the confirm step (payload is JSON in a hidden field), then show done. */
export async function saveConfirmationAction(formData: FormData): Promise<void> {
  const raw = formData.get("payload");
  if (typeof raw !== "string") throw new Error("Missing confirmation payload");
  const payload = parseConfirmationPayload(JSON.parse(raw));
  const { farmId, alreadyFinalized } = await saveConfirmation(prisma, payload);
  // First time through, run the engines so the home screen has findings the moment
  // the farmer lands on it. A re-submit (alreadyFinalized) skips it; the home's
  // "Recheck for savings" re-runs on demand after that.
  if (!alreadyFinalized) await runEngines(prisma, farmId);
  // Bust the client router cache so the dashboard shows this farm, not a stale one.
  revalidatePath("/dashboard/pump-timing");
  redirect(`${ONBOARDING}/done?farm=${farmId}`);
}
