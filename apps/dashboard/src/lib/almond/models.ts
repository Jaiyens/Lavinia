export const ALMOND_MODELS = [
  {
    id: "anthropic/claude-opus-4.8",
    label: "Claude Opus 4.8",
    description: "Best for deeper farm analysis",
  },
  {
    id: "anthropic/claude-sonnet-4.6",
    label: "Claude Sonnet 4.6",
    description: "Faster everyday analysis",
  },
  {
    id: "openai/gpt-5.5",
    label: "GPT-5.5",
    description: "Alternative frontier model",
  },
] as const;

export type AlmondModelId = (typeof ALMOND_MODELS)[number]["id"];

export const DEFAULT_ALMOND_MODEL: AlmondModelId = "anthropic/claude-opus-4.8";

export function resolveAlmondModel(value: unknown): AlmondModelId {
  return typeof value === "string" && ALMOND_MODELS.some((model) => model.id === value)
    ? (value as AlmondModelId)
    : DEFAULT_ALMOND_MODEL;
}
