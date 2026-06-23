import ExcelJS from "exceljs";
import type { PrismaClient } from "@prisma/client";
import { tool, type UIMessage } from "ai";
import { z } from "zod";
import { computeKpiStrip } from "@/lib/dashboard/kpi";
import { loadFindings } from "@/lib/dashboard/findings";
import { loadMetersForFarm } from "@/lib/dashboard/load";
import { analyzeFarm } from "@/lib/almond/analysis";
import { buildReportSnapshot } from "@/lib/almond/codegen/snapshot";
import { summarizeExportState } from "@/lib/almond/export/load";
import { sanitizeHistoryMessages } from "@/lib/almond/history";
import type { AlmondToolDeps } from "@/lib/almond/tools";

export type SandboxContextFile = {
  path: string;
  content: string;
  contentType: "text/markdown" | "application/json" | "text/csv" | "application/jsonl";
  description: string;
};

export type AlmondSandboxContext = {
  files: SandboxContextFile[];
  generatedAt: string;
};

type BuildSandboxContextInput = {
  prisma: PrismaClient;
  userId: string | null;
  farmId: string;
  farmName: string;
  uiMessages?: UIMessage[];
};

type SandboxTextWriter = {
  writeTextFile(args: { path: string; content: string; abortSignal?: AbortSignal }): PromiseLike<void>;
};

function jsonFile(path: string, description: string, value: unknown): SandboxContextFile {
  return {
    path,
    description,
    contentType: "application/json",
    content: `${JSON.stringify(value, null, 2)}\n`,
  };
}

function markdownFile(path: string, description: string, content: string): SandboxContextFile {
  return { path, description, contentType: "text/markdown", content };
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csvFile(path: string, description: string, headers: string[], rows: unknown[][]): SandboxContextFile {
  return {
    path,
    description,
    contentType: "text/csv",
    content: [[...headers], ...rows].map((row) => row.map(csvEscape).join(",")).join("\n") + "\n",
  };
}

function jsonlFile(path: string, description: string, rows: unknown[]): SandboxContextFile {
  return {
    path,
    description,
    contentType: "application/jsonl",
    content: rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length > 0 ? "\n" : ""),
  };
}

function dataUrlToBytes(url: string): Uint8Array | null {
  if (!url.startsWith("data:")) return null;
  const comma = url.indexOf(",");
  if (comma === -1) return null;
  const meta = url.slice(5, comma);
  const data = url.slice(comma + 1);
  try {
    if (meta.includes("base64")) return new Uint8Array(Buffer.from(data, "base64"));
    return new Uint8Array(Buffer.from(decodeURIComponent(data), "utf-8"));
  } catch {
    return null;
  }
}

async function workbookSheets(bytes: Uint8Array): Promise<Array<{ name: string; rows: string[][] }>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const sheets: Array<{ name: string; rows: string[][] }> = [];
  wb.eachSheet((sheet) => {
    const rows: string[][] = [];
    sheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values.map((value) => (value === null || value === undefined ? "" : String(value))));
    });
    sheets.push({ name: sheet.name, rows });
  });
  return sheets;
}

function safeSlug(value: string): string {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "file";
}

async function uploadFilesFromMessages(messages: UIMessage[] = []): Promise<SandboxContextFile[]> {
  const files: SandboxContextFile[] = [];
  let index = 0;

  for (const message of messages) {
    if (message.role !== "user") continue;
    for (const part of message.parts ?? []) {
      if (part.type !== "file") continue;
      index += 1;
      const name = part.filename ?? `upload-${index}`;
      const base = `${String(index).padStart(2, "0")}-${safeSlug(name)}`;
      const bytes = dataUrlToBytes(part.url);
      const manifest = {
        messageId: message.id,
        filename: name,
        mediaType: part.mediaType,
        byteLength: bytes?.byteLength ?? null,
      };
      files.push(jsonFile(`inputs/uploads/${base}.manifest.json`, `Upload manifest for ${name}`, manifest));
      if (bytes === null) continue;

      const lower = name.toLowerCase();
      if (part.mediaType === "text/csv" || lower.endsWith(".csv")) {
        files.push({
          path: `inputs/uploads/${base}.csv`,
          description: `Uploaded CSV ${name}`,
          contentType: "text/csv",
          content: new TextDecoder().decode(bytes),
        });
        continue;
      }

      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        try {
          const sheets = await workbookSheets(bytes);
          for (const sheet of sheets) {
            files.push(csvFile(
              `inputs/uploads/${base}.${safeSlug(sheet.name)}.csv`,
              `Uploaded workbook ${name}, sheet ${sheet.name}`,
              [],
              sheet.rows,
            ));
          }
        } catch {
          files.push(markdownFile(
            `inputs/uploads/${base}.unreadable.md`,
            `Unreadable uploaded workbook ${name}`,
            `# ${name}\n\nThe workbook bytes were present, but the server-side parser could not read them.\n`,
          ));
        }
      }
    }
  }

  return files;
}

export async function buildAlmondSandboxContext({
  prisma,
  userId,
  farmId,
  farmName,
  uiMessages = [],
}: BuildSandboxContextInput): Promise<AlmondSandboxContext> {
  const deps: AlmondToolDeps = { prisma, farmId, farmName, meterUserId: userId };
  const [user, permittedFarms, meters, findings, reports, conversations, reportSnapshot, uploadFiles] =
    await Promise.all([
      userId
        ? prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true } })
        : Promise.resolve(null),
      userId
        ? prisma.farmMembership.findMany({
            where: { userId, status: "active" },
            select: { role: true, farm: { select: { id: true, name: true, isDemo: true } } },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve([]),
      loadMetersForFarm(prisma, farmId),
      loadFindings(prisma, farmId),
      prisma.generatedReport.findMany({
        where: { farmId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          kind: true,
          title: true,
          requestText: true,
          byteSize: true,
          coverageAsOf: true,
          paramsJson: true,
          cacheKey: true,
          meterCount: true,
          createdAt: true,
        },
      }),
      userId
        ? prisma.almondConversation.findMany({
            where: { userId, farmId },
            orderBy: { updatedAt: "desc" },
            take: 25,
            select: { id: true, title: true, messages: true, updatedAt: true },
          })
        : Promise.resolve([]),
      buildReportSnapshot(deps),
      uploadFilesFromMessages(uiMessages),
    ]);

  const exportState = summarizeExportState(meters);
  const analysis = analyzeFarm(meters, findings);
  const kpi = computeKpiStrip(meters);
  const generatedAt = new Date().toISOString();

  const files: SandboxContextFile[] = [
    markdownFile(
      "inputs/context-index.md",
      "Top-level index for grep-able Almond context",
      [
        "# Almond Sandbox Context",
        "",
        `Generated: ${generatedAt}`,
        `Active farm: ${farmName} (${farmId})`,
        "",
        "Use grep, rg, glob, and bash over this directory to inspect authorized Terra context.",
        "Start with the CSV and JSONL files when searching for meter names, rates, accounts, bills, findings, or uploaded rows.",
        "",
        "## Files",
        "- `inputs/user/profile.json` - signed-in user profile, when available.",
        "- `inputs/user/permitted-farms.json` - farms this user can access.",
        "- `inputs/farm/overview.json` - KPI and coverage summary for the active farm.",
        "- `inputs/farm/meters.csv` - one row per meter.",
        "- `inputs/farm/billing-periods.jsonl` - one row per meter billing period.",
        "- `inputs/farm/findings.jsonl` - open findings and recommendations.",
        "- `inputs/farm/analysis.json` - Almond's derived analysis object.",
        "- `inputs/reports/generated-reports.jsonl` - generated report metadata.",
        "- `inputs/conversations/*.md` - sanitized prior Almond conversation text.",
        "- `inputs/uploads/*` - uploaded CSV/workbook context from the current chat request.",
        "",
      ].join("\n"),
    ),
    jsonFile("inputs/user/profile.json", "Signed-in user profile", user),
    jsonFile(
      "inputs/user/permitted-farms.json",
      "Farms the signed-in user is authorized to access",
      permittedFarms.map((m) => ({ role: m.role, farm: m.farm })),
    ),
    jsonFile("inputs/farm/overview.json", "Active farm KPI and coverage overview", {
      farm: { id: farmId, name: farmName },
      generatedAt,
      kpi,
      coverage: exportState,
      meterCount: meters.length,
      findingCount: findings.length,
    }),
    csvFile(
      "inputs/farm/meters.csv",
      "One row per active-farm meter",
      [
        "id",
        "name",
        "serviceId",
        "accountNumber",
        "entityName",
        "ranchName",
        "cropName",
        "rateSchedule",
        "coverageState",
        "costSource",
        "modeledMonthlyCents",
        "isSolar",
        "gpm",
        "latitude",
        "longitude",
      ],
      meters.map((m) => [
        m.id,
        m.name,
        m.serviceId,
        m.accountNumber,
        m.entityName,
        m.ranchName,
        m.cropName,
        m.rateSchedule,
        m.coverageState,
        m.costSource,
        m.modeledMonthlyCents,
        m.isSolar,
        m.gpm,
        m.latitude,
        m.longitude,
      ]),
    ),
    jsonlFile(
      "inputs/farm/billing-periods.jsonl",
      "Meter billing periods and line items",
      meters.flatMap((meter) =>
        meter.periods.map((period) => ({
          meterId: meter.id,
          meterName: meter.name,
          accountNumber: meter.accountNumber,
          rateSchedule: meter.rateSchedule,
          ...period,
        })),
      ),
    ),
    jsonlFile("inputs/farm/findings.jsonl", "Open findings and recommendations", findings),
    jsonFile("inputs/farm/analysis.json", "Almond derived farm analysis", analysis),
    jsonFile("inputs/farm/report-snapshot.json", "Canonical codegen report snapshot", reportSnapshot),
    jsonlFile(
      "inputs/reports/generated-reports.jsonl",
      "Generated report metadata, newest first",
      reports.map((report) => ({ ...report, createdAt: report.createdAt.toISOString() })),
    ),
    ...conversations.map((conversation) =>
      markdownFile(
        `inputs/conversations/${safeSlug(conversation.title)}-${conversation.id}.md`,
        `Sanitized Almond conversation ${conversation.title}`,
        [
          `# ${conversation.title}`,
          "",
          `Updated: ${conversation.updatedAt.toISOString()}`,
          "",
          ...sanitizeHistoryMessages(conversation.messages).map((message) => {
            const text = message.parts.map((part) => part.text).join("\n");
            return `## ${message.role}\n\n${text}\n`;
          }),
        ].join("\n"),
      ),
    ),
    ...uploadFiles,
  ];

  return { files, generatedAt };
}

export async function writeAlmondSandboxContext({
  context,
  writer,
  root,
  abortSignal,
}: {
  context: AlmondSandboxContext;
  writer: SandboxTextWriter;
  root: string;
  abortSignal?: AbortSignal;
}): Promise<void> {
  for (const file of context.files) {
    await writer.writeTextFile({
      path: `${root.replace(/\/$/, "")}/${file.path}`,
      content: file.content,
      abortSignal,
    });
  }
}

function safeContextPath(path: string): string | null {
  if (path.startsWith("/") || path.includes("..")) return null;
  return path;
}

export function buildAlmondSandboxContextTools(context: AlmondSandboxContext) {
  const files = new Map(context.files.map((file) => [file.path, file]));
  return {
    listAvailableContext: tool({
      description: "List the authorized Terra context files available to inspect for this task.",
      inputSchema: z.object({}),
      execute: async () => ({
        generatedAt: context.generatedAt,
        files: context.files.map(({ path, contentType, description }) => ({ path, contentType, description })),
      }),
    }),
    readContextFile: tool({
      description: "Read one authorized Terra context file by path.",
      inputSchema: z.object({ path: z.string().describe("Path from listAvailableContext, e.g. inputs/farm/meters.csv") }),
      execute: async ({ path }) => {
        const safePath = safeContextPath(path);
        const file = safePath ? files.get(safePath) : undefined;
        return file ? { path: file.path, contentType: file.contentType, content: file.content } : { error: "not_found" };
      },
    }),
    searchUserContext: tool({
      description: "Search authorized Terra context files for a text query, like a scoped grep.",
      inputSchema: z.object({
        query: z.string().min(1),
        limit: z.number().int().min(1).max(200).optional(),
        caseSensitive: z.boolean().optional(),
      }),
      execute: async ({ query, limit = 50, caseSensitive = false }) => {
        const needle = caseSensitive ? query : query.toLowerCase();
        const matches: Array<{ path: string; line: number; text: string }> = [];
        for (const file of context.files) {
          const lines = file.content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i] ?? "";
            const haystack = caseSensitive ? line : line.toLowerCase();
            if (haystack.includes(needle)) {
              matches.push({ path: file.path, line: i + 1, text: line });
              if (matches.length >= limit) return { matches };
            }
          }
        }
        return { matches };
      },
    }),
  };
}
