import { HarnessAgent } from "@ai-sdk/harness/agent";
import { createClaudeCode } from "@ai-sdk/harness-claude-code";
import { createCodex } from "@ai-sdk/harness-codex";
import { createVercelSandbox } from "@ai-sdk/sandbox-vercel";
import { resolveGatewayKey } from "@/lib/ai/gateway";
import {
  buildAlmondSandboxContextTools,
  writeAlmondSandboxContext,
  type AlmondSandboxContext,
} from "./context";

export const ALMOND_HARNESS_RUNTIMES = ["claude-code", "codex"] as const;
export type AlmondHarnessRuntime = (typeof ALMOND_HARNESS_RUNTIMES)[number];

export function isAlmondHarnessRuntime(value: unknown): value is AlmondHarnessRuntime {
  return typeof value === "string" && ALMOND_HARNESS_RUNTIMES.includes(value as AlmondHarnessRuntime);
}

export function resolveAlmondHarnessRuntime(value: unknown): AlmondHarnessRuntime {
  return isAlmondHarnessRuntime(value) ? value : "claude-code";
}

export function harnessRuntimeForModel(modelId: string): AlmondHarnessRuntime | null {
  if (modelId.startsWith("anthropic/")) return "claude-code";
  if (modelId.startsWith("openai/")) return "codex";
  return null;
}

export function supportsAlmondHarness(modelId: string): boolean {
  return harnessRuntimeForModel(modelId) !== null;
}

export function createAlmondHarnessAgent({
  context,
  runtime,
  modelId,
}: {
  context: AlmondSandboxContext;
  runtime: AlmondHarnessRuntime;
  modelId: string;
}) {
  return new HarnessAgent({
    id: `almond-${runtime}`,
    harness:
      runtime === "codex"
        ? createCodex({ model: modelId, auth: { gateway: { apiKey: resolveGatewayKey() } } })
        : createClaudeCode({
            model: modelId,
            thinking: "adaptive",
            auth: { gateway: { apiKey: resolveGatewayKey() } },
          }),
    sandbox: createVercelSandbox({
      runtime: "node24",
      ports: [4000],
    }),
    permissionMode: "allow-all",
    instructions: [
      "You are Almond's sandboxed coding agent for Terra.",
      "Use the grep-able files under inputs/ and the read tools to inspect the user's authorized farm context.",
      "You may use shell-style inspection over the sandbox workspace, including grep, rg, glob, and bash.",
      "Never assume production database access or secrets. All user and farm context is provided through packaged files and scoped read tools.",
      "When producing an artifact or answer, cite which context files or tools you inspected.",
    ].join("\n"),
    tools: buildAlmondSandboxContextTools(context),
    onSandboxSession: async ({ session, sessionWorkDir, abortSignal }) => {
      await writeAlmondSandboxContext({
        context,
        writer: session,
        root: sessionWorkDir,
        abortSignal,
      });
    },
  });
}
