import { get, put } from "@vercel/blob";
import type { HarnessAgentResumeSessionState } from "@ai-sdk/harness/agent";

type StoredHarnessSession = {
  chatId: string;
  harnessId: string;
  updatedAt: string;
  resumeState: HarnessAgentResumeSessionState;
};

function key(chatId: string): string {
  return `almond-harness-sessions/${encodeURIComponent(chatId)}.json`;
}

export async function loadHarnessSessionState({
  chatId,
  harnessId,
}: {
  chatId: string;
  harnessId: string;
}): Promise<HarnessAgentResumeSessionState | undefined> {
  const result = await get(key(chatId), { access: "private", useCache: false });
  if (result === null || result.statusCode !== 200) return undefined;
  const text = await new Response(result.stream).text();
  const stored = JSON.parse(text) as StoredHarnessSession;
  if (stored.harnessId !== harnessId) return undefined;
  return stored.resumeState;
}

export async function saveHarnessSessionState({
  chatId,
  harnessId,
  resumeState,
}: {
  chatId: string;
  harnessId: string;
  resumeState: HarnessAgentResumeSessionState;
}): Promise<void> {
  const body: StoredHarnessSession = {
    chatId,
    harnessId,
    updatedAt: new Date().toISOString(),
    resumeState,
  };
  await put(key(chatId), JSON.stringify(body), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}
