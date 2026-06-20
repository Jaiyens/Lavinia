import type { Prisma, PrismaClient } from "@prisma/client";
import { newReportBlobKey, putPrivateBlob, XLSX_CONTENT_TYPE } from "@/lib/storage/blob";

/**
 * Reports persistence (Story 8.6). When Almond hands an authenticated OWNER a spreadsheet (the 8.5
 * exportSpreadsheet skill), the bytes are kept privately so the grower can fetch the same file
 * again later. This module is the single write path for that:
 *
 *   1. Write the bytes to a PRIVATE Vercel Blob under a non-guessable key (src/lib/storage/blob.ts),
 *      never a public URL.
 *   2. Insert a GeneratedReport row recording WHAT the file was (kind/title), WHEN it was made
 *      (createdAt), the request that produced it (requestText), the coverage as-of, and the shape
 *      params — but NEVER the bytes (those live only in Blob).
 *
 * Farm-scoped by inheritance (Story law): `storeReport` takes a resolved `farmId` on its deps and an
 * optional `createdById`; it never accepts a scope from the model. The bytes are IMMUTABLE — a
 * refresh calls `storeReport` again and gets a NEW row under a NEW key; nothing is rewritten in
 * place (the blob is written with `allowOverwrite: false`, and we never update an existing row).
 *
 * The public Tour can never reach this: the exportSpreadsheet skill (and the stub's export branch)
 * persist ONLY for an authed owner (capability-by-omission), so an unauthenticated caller's export
 * is never stored.
 */

/** The persisted report shapes, mirrored by GeneratedReport.kind (a String in the schema). The two
 *  spreadsheet shapes match the exportSpreadsheet skill's EXPORT_TABLES so a persisted kind
 *  round-trips to the same builder; `"report"` is the generateReport skill's PDF (Story 9.3);
 *  `"codegen"` is the model-authored bespoke PDF from the code-gen export POC (rendered in a Vercel
 *  Sandbox, verified fail-closed) — a distinct kind so Reports history can tell a custom report from a
 *  deterministic one. The column stays a free String, so storing a new kind needs no migration. */
export const GENERATED_REPORT_KINDS = ["meters", "billDue", "report", "codegen"] as const;
export type GeneratedReportKind = (typeof GENERATED_REPORT_KINDS)[number];

/** The deps the store closes over: a Prisma client, the resolved farm scope, and (optionally) the
 *  signed-in grower's user id. Scope lives here, never in an argument the model could set. */
export type ReportStoreDeps = {
  prisma: PrismaClient;
  farmId: string;
  /** The signed-in grower who asked for it, when known. Null for a server context with no user row;
   *  ownership is enforced on the FARM at download time, not on this column. */
  createdById?: string | null;
};

/** Everything about the file the store needs to persist. The bytes plus the metadata the export
 *  skill already authored (file name, kind, coverage as-of), the grower's request, and the shape
 *  params. No farmId here — scope comes from `deps` — and no value the model authored. */
export type ReportToStore = {
  kind: GeneratedReportKind;
  /** The server-authored download file name (e.g. "acme-meters.xlsx"); also the row's title basis. */
  title: string;
  /** The grower's request that produced the file, captured verbatim for the Reports history. */
  requestText: string;
  /** The freshest billed cycle the figures reflect, or null when no bill has posted (never faked). */
  coverageAsOf: string | null;
  /** The shape params the report was built from (table + filter), for a deterministic refresh. */
  params: Prisma.InputJsonValue;
  /** The serialized file bytes to store privately. */
  bytes: Uint8Array;
  /** The content type to store the blob under. Defaults to the .xlsx type. */
  contentType?: string;
};

/** A persisted report's identity, returned so the caller (the responder) can offer the download
 *  link and show the "saved to Reports" line. */
export type StoredReport = {
  id: string;
  blobPathname: string;
  byteSize: number;
};

/**
 * Persist a generated report: write the bytes to a private blob, then insert the GeneratedReport row.
 * Order matters — the blob is written FIRST so the row never references a key whose bytes failed to
 * land (a dangling pathname). If the row insert fails the blob is orphaned (harmless, unreferenced
 * private bytes), never the reverse. Returns the new row's id + stored pathname + size.
 *
 * Scope (`farmId`) and authorship (`createdById`) come ONLY from `deps`; the model never sets them.
 */
export async function storeReport(
  deps: ReportStoreDeps,
  report: ReportToStore,
): Promise<StoredReport> {
  const pathname = newReportBlobKey();
  const stored = await putPrivateBlob(
    pathname,
    report.bytes,
    report.contentType ?? XLSX_CONTENT_TYPE,
  );

  const row = await deps.prisma.generatedReport.create({
    data: {
      farmId: deps.farmId,
      createdById: deps.createdById ?? null,
      kind: report.kind,
      title: report.title,
      requestText: report.requestText,
      blobPathname: stored.pathname,
      byteSize: stored.byteSize,
      coverageAsOf: report.coverageAsOf,
      paramsJson: report.params,
    },
    select: { id: true, blobPathname: true, byteSize: true },
  });

  return { id: row.id, blobPathname: row.blobPathname, byteSize: row.byteSize };
}

/**
 * Load a single report, FARM-SCOPED. The download route resolves the caller's own farm and passes
 * its id here: a report whose `farmId` does not match is returned as null (the route turns that into
 * a 404), so a different farm's report id is structurally unreachable — cross-farm access cannot
 * succeed even with a valid id. Read-only.
 */
export async function loadReportForFarm(
  prisma: PrismaClient,
  farmId: string,
  reportId: string,
): Promise<{ blobPathname: string; title: string; byteSize: number } | null> {
  const row = await prisma.generatedReport.findFirst({
    where: { id: reportId, farmId },
    select: { blobPathname: true, title: true, byteSize: true },
  });
  return row;
}

/** One row of the Reports history list (Story 8.7), already farm-scoped at the query. The bytes are
 *  NEVER read here (the byte stream is the download route's job); this carries only what the list
 *  renders: which report, what shape it is, when it was made, and the request that produced it. */
export type ReportListRow = {
  id: string;
  kind: string;
  title: string;
  requestText: string;
  createdAt: Date;
};

/**
 * List a farm's generated reports, newest first (Story 8.7, the Reports area). FARM-SCOPED: the
 * caller resolves its OWN farm and passes that id, so a report belonging to another farm is never
 * returned (and never linked) — the same isolation gate as `loadReportForFarm`, applied to the list.
 * Read-only; selects only the columns the list shows (never `blobPathname`, never the bytes).
 */
export async function listReportsForFarm(
  prisma: PrismaClient,
  farmId: string,
): Promise<ReportListRow[]> {
  return prisma.generatedReport.findMany({
    where: { farmId },
    orderBy: { createdAt: "desc" },
    select: { id: true, kind: true, title: true, requestText: true, createdAt: true },
  });
}
