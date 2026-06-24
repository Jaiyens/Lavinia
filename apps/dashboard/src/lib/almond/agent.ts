import type { Sandbox } from "@vercel/sandbox";
import { createBashTool } from "bash-tool";
import { isStepCount, ToolLoopAgent, type ToolSet } from "ai";
import { createGatewayModel } from "@/lib/ai/gateway";
import { buildAlmondInstructions } from "./instructions";
import type { AlmondModelId } from "./models";

const BLOCKED_COMMAND = "echo 'Blocked: this command is not allowed in the farm-data sandbox.'";
const DANGEROUS_COMMANDS = [
  /\brm\s+-(?:[a-zA-Z]*r[a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*r)\s+\//,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bmkfs\b/,
  /\bdd\s+/,
  /:\(\)\s*\{\s*:\|:&\s*\}/,
];

function guardCommand(command: string): string {
  return DANGEROUS_COMMANDS.some((pattern) => pattern.test(command)) ? BLOCKED_COMMAND : command;
}

export async function createAlmondAgent(opts: {
  modelId: AlmondModelId;
  farmName: string;
  farmFiles: Record<string, string>;
  sandbox: Sandbox;
}) {
  const { tools } = await createBashTool({
    sandbox: opts.sandbox,
    files: opts.farmFiles,
    extraInstructions: [
      `The farm data for "${opts.farmName}" is staged under ./inputs/.`,
      "Start by running: ls inputs/ && sed -n '1,80p' inputs/context-index.md",
    ].join("\n"),
    onBeforeBashCall: ({ command }) => ({ command: guardCommand(command) }),
    maxOutputLength: 30_000,
  });
  const aiSdk7Tools = tools as unknown as ToolSet;

  return new ToolLoopAgent({
    model: createGatewayModel(opts.modelId),
    instructions: buildAlmondInstructions(
      opts.farmName,
      `Vercel Sandbox ${opts.sandbox.sandboxId}; working directory is /vercel/sandbox/workspace.`,
    ),
    tools: aiSdk7Tools,
    stopWhen: isStepCount(24),
  });
}

export type AlmondAgent = Awaited<ReturnType<typeof createAlmondAgent>>;
