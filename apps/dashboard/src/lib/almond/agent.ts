import type { Sandbox } from "@vercel/sandbox";
import path from "node:path";
import { createBashTool, type CommandResult } from "bash-tool";
import { isStepCount, ToolLoopAgent, type ToolExecutionOptions, type ToolSet } from "ai";
import { createGatewayModel } from "@/lib/ai/gateway";
import { buildAlmondInstructions } from "./instructions";
import type { AlmondModelId } from "./models";

const WORKSPACE_DIR = "/vercel/sandbox/workspace";
const OUTPUTS_DIR = `${WORKSPACE_DIR}/outputs`;
const MAX_DOWNLOADABLE_FILES_PER_CALL = 8;
const MAX_DOWNLOADABLE_FILE_BYTES = 2 * 1024 * 1024;
const BLOCKED_COMMAND = "echo 'Blocked: this command is not allowed in the farm-data sandbox.'";
const DANGEROUS_COMMANDS = [
  /\brm\s+-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)\s+\//,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bmkfs\b/,
  /\bdd\s+/,
  /:\(\)\s*\{\s*:\|:&\s*\}/,
];

const TEXT_FILE_EXTENSIONS = new Set([
  "csv",
  "html",
  "json",
  "jsonl",
  "js",
  "md",
  "py",
  "sh",
  "ts",
  "tsv",
  "txt",
  "xml",
  "yaml",
  "yml",
]);

const MIME_TYPES: Record<string, string> = {
  csv: "text/csv",
  html: "text/html",
  json: "application/json",
  jsonl: "application/x-ndjson",
  js: "text/javascript",
  md: "text/markdown",
  pdf: "application/pdf",
  png: "image/png",
  py: "text/x-python",
  sh: "text/x-shellscript",
  ts: "text/typescript",
  tsv: "text/tab-separated-values",
  txt: "text/plain",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  xml: "application/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
  zip: "application/zip",
};

type SandboxStats = Awaited<ReturnType<Sandbox["fs"]["stat"]>>;

type GeneratedFileArtifact = {
  path: string;
  filename: string;
  mimeType: string;
  size: number;
  encoding: "utf8" | "base64";
  content: string;
};

type GeneratedFileArtifactMetadata = Omit<GeneratedFileArtifact, "content">;
type BashToolInput = { command: string };
type BashToolOutput = CommandResult & { generatedFiles?: GeneratedFileArtifact[] };
type ExecutableBashTool = {
  execute: (input: BashToolInput, options: ToolExecutionOptions<never>) => Promise<CommandResult>;
};

function guardCommand(command: string): string {
  return DANGEROUS_COMMANDS.some((pattern) => pattern.test(command)) ? BLOCKED_COMMAND : command;
}

function extensionForPath(filePath: string): string {
  return path.posix.extname(filePath).slice(1).toLowerCase();
}

function mimeForPath(filePath: string): string {
  return MIME_TYPES[extensionForPath(filePath)] ?? "application/octet-stream";
}

function isTextFile(filePath: string): boolean {
  return TEXT_FILE_EXTENSIONS.has(extensionForPath(filePath));
}

function artifactMetadata(file: GeneratedFileArtifact): GeneratedFileArtifactMetadata {
  return {
    path: file.path,
    filename: file.filename,
    mimeType: file.mimeType,
    size: file.size,
    encoding: file.encoding,
  };
}

function signatureForStats(stats: SandboxStats): string {
  return `${stats.size}:${stats.mtimeMs}`;
}

async function statOrNull(sandbox: Sandbox, filePath: string): Promise<SandboxStats | null> {
  try {
    return await sandbox.fs.stat(filePath);
  } catch {
    return null;
  }
}

async function listOutputFiles(sandbox: Sandbox, dir: string, depth = 0): Promise<string[]> {
  let entries: string[];
  try {
    entries = await sandbox.fs.readdir(dir);
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith(".")) continue;

    const absolutePath = path.posix.join(dir, entry);
    const stats = await statOrNull(sandbox, absolutePath);
    if (!stats) continue;

    if (stats.isFile()) {
      files.push(absolutePath);
    } else if (stats.isDirectory() && depth < 4) {
      files.push(...(await listOutputFiles(sandbox, absolutePath, depth + 1)));
    }
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function collectNewOutputArtifacts(
  sandbox: Sandbox,
  seenSignatures: Map<string, string>,
): Promise<GeneratedFileArtifact[]> {
  const files = await listOutputFiles(sandbox, OUTPUTS_DIR);
  const artifacts: GeneratedFileArtifact[] = [];

  for (const absolutePath of files) {
    if (artifacts.length >= MAX_DOWNLOADABLE_FILES_PER_CALL) break;

    const relativePath = path.posix.relative(WORKSPACE_DIR, absolutePath);
    const stats = await statOrNull(sandbox, absolutePath);
    if (!stats?.isFile()) continue;

    const signature = signatureForStats(stats);
    if (seenSignatures.get(relativePath) === signature) continue;
    seenSignatures.set(relativePath, signature);

    if (stats.size > MAX_DOWNLOADABLE_FILE_BYTES) continue;

    const buffer = await sandbox.readFileToBuffer({ path: relativePath, cwd: WORKSPACE_DIR });
    if (!buffer) continue;

    const encoding = isTextFile(relativePath) ? "utf8" : "base64";
    artifacts.push({
      path: relativePath,
      filename: path.posix.basename(relativePath),
      mimeType: mimeForPath(relativePath),
      size: buffer.byteLength,
      encoding,
      content: encoding === "utf8" ? buffer.toString("utf8") : buffer.toString("base64"),
    });
  }

  return artifacts;
}

export async function createAlmondAgent(opts: {
  modelId: AlmondModelId;
  farmName: string;
  farmFiles: Record<string, string>;
  sandbox: Sandbox;
}) {
  const seenOutputSignatures = new Map<string, string>();
  const hasDocExportSnapshot = !!process.env.DOC_EXPORT_SNAPSHOT_ID;
  const { tools } = await createBashTool({
    sandbox: opts.sandbox,
    files: opts.farmFiles,
    extraInstructions: [
      `The farm data for "${opts.farmName}" is staged under ./inputs/.`,
      "Start by running: ls inputs/ && sed -n '1,80p' inputs/context-index.md",
      "Save files meant for the grower under ./outputs/ so Terra can offer them as downloads.",
      ...(hasDocExportSnapshot
        ? [
            "",
            "Document generation libraries are pre-installed:",
            "  Python: openpyxl, pandas, numpy, reportlab, pypdf",
            "  Node:   pptxgenjs (use NODE_PATH=$(npm root -g) before node commands)",
            "Use python3 for xlsx/pdf generation and Node for pptx. Write output files to ./outputs/.",
          ]
        : []),
    ].join("\n"),
    onBeforeBashCall: ({ command }) => ({ command: guardCommand(command) }),
    maxOutputLength: 30_000,
  });
  const bashTool = tools.bash as typeof tools.bash & ExecutableBashTool;
  const aiSdk7Tools = {
    ...tools,
    bash: {
      ...bashTool,
      execute: async (input: BashToolInput, options: ToolExecutionOptions<never>): Promise<BashToolOutput> => {
        const result = (await bashTool.execute(input, options)) as CommandResult;
        const generatedFiles = await collectNewOutputArtifacts(opts.sandbox, seenOutputSignatures);
        return generatedFiles.length > 0 ? { ...result, generatedFiles } : result;
      },
      toModelOutput: ({ output }: { output: BashToolOutput }) => ({
        type: "json" as const,
        value: {
          stdout: output.stdout,
          stderr: output.stderr,
          exitCode: output.exitCode,
          ...(output.teeFiles ? { teeFiles: output.teeFiles } : {}),
          ...(output.generatedFiles ? { generatedFiles: output.generatedFiles.map(artifactMetadata) } : {}),
        },
      }),
    },
  } as unknown as ToolSet;

  return new ToolLoopAgent({
    model: createGatewayModel(opts.modelId),
    instructions: buildAlmondInstructions(
      opts.farmName,
      [
        `Vercel Sandbox ${opts.sandbox.sandboxId}; working directory is /vercel/sandbox/workspace.`,
        ...(hasDocExportSnapshot
          ? ["Python 3.13 + Node 18 available. Pre-installed: openpyxl, pandas, numpy, reportlab, pypdf, pptxgenjs."]
          : []),
      ].join(" "),
    ),
    tools: aiSdk7Tools,
    stopWhen: isStepCount(24),
  });
}

export type AlmondAgent = Awaited<ReturnType<typeof createAlmondAgent>>;
