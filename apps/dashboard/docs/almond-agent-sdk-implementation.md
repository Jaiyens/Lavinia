# Almond Agent SDK Implementation Notes

## AI SDK v7 Upgrade

The dashboard workspace is on the AI SDK v7 beta packages:

- `ai`
- `@ai-sdk/react`
- `@ai-sdk/harness`
- `@ai-sdk/harness-claude-code`
- `@ai-sdk/harness-codex`
- `@ai-sdk/sandbox-vercel`

The default Almond chat route now prefers harnesses when the selected model supports them:

- Anthropic / Claude models use the Claude Code harness.
- OpenAI / GPT models use the Codex harness.
- Gemini models are removed from the picker until Terra has a Gemini-capable harness loop with the
  same sandbox/context guarantees.

The existing model/tool-loop path in `src/lib/almond/responder.ts` remains as the fallback for a
future unsupported model, local stub mode, or an explicit non-harness integration.

## AI Elements Mapping

The AI Elements registry CLI was not available in this environment, so the first pass adds local
AI Elements-compatible primitives under `src/components/ai-elements/`.

- `message.tsx` wraps user and assistant message layout.
- `reasoning.tsx` wraps the existing Thought disclosure.
- `prompt-input.tsx` gives Almond a local PromptInput-compatible surface for a later composer pass.
- `conversation.tsx` gives the panel/page a local Conversation-compatible surface for a later layout pass.

The first integration keeps Almond's current visual design and behavior intact by only wiring message
and reasoning wrappers into the existing components.

## Harness Default

The primary chat route builds harness responders through `defaultAlmondResponder()` whenever the
resolved model is Anthropic or OpenAI. The legacy `src/app/api/almond/harness/route.ts` endpoint is
kept as a direct prototype/debug entry point.

The route:

- Requires a signed-in user.
- Resolves the active farm server-side.
- Builds a broad authorized context package for the user/farm.
- Writes that package into the Vercel Sandbox under `inputs/`.
- Enables Claude Code or Codex via AI SDK v7 `HarnessAgent`, depending on the selected model.
- Persists opaque harness resume state in private Vercel Blob.

The harness path gives Almond bash, grep, glob, and sandboxed file inspection over broad authorized
Terra context by default for capable model families.

## Sandbox Context Contract

`src/lib/almond/harness/context.ts` packages context as grep-able files:

- `inputs/context-index.md`
- `inputs/user/profile.json`
- `inputs/user/permitted-farms.json`
- `inputs/farm/overview.json`
- `inputs/farm/meters.csv`
- `inputs/farm/billing-periods.jsonl`
- `inputs/farm/findings.jsonl`
- `inputs/farm/analysis.json`
- `inputs/farm/report-snapshot.json`
- `inputs/reports/generated-reports.jsonl`
- `inputs/conversations/*.md`
- `inputs/uploads/*`

The same context is also exposed through scoped host tools:

- `listAvailableContext`
- `readContextFile`
- `searchUserContext`

The sandbox gets broad read access to authorized user context, but it does not receive production
database credentials, utility credentials, OAuth tokens, Blob tokens, or unrelated farms.

## Pass/Fail Criteria

Harnesses can move closer to Almond proper only if they pass all of these:

- They can inspect uploaded CSV/workbook data with grep, glob, bash, or scoped context tools.
- They can inspect broad active-farm context without direct production DB credentials.
- They preserve or intentionally replace Almond's transient UI parts for navigation, reports, and Auto decisions.
- They can resume across requests through durable session state.
- They do not leak cross-farm data, secrets, utility credentials, or private Blob credentials into the sandbox.
- They keep Gemini disabled until a Gemini harness loop exists.

If any of those fail, the affected model family should fall back to the legacy model/tool-loop path.
