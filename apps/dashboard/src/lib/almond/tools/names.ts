// The crop tool names, isolated in a dependency-free module so BOTH the server responder and the
// CLIENT chat render switch can import them without the client pulling in streamText / the gateway /
// the Prisma loader. These string keys are the contract: the responder registers tools under them
// and the chat's result dispatcher matches `tool-${name}` parts to result components by them.

export const CROP_TOOL_NAMES = {
  position: "showPosition",
  packerTable: "showPackerTable",
  yoyChart: "showYoyChart",
  findReport: "findReport",
} as const;

export type CropToolName = (typeof CROP_TOOL_NAMES)[keyof typeof CROP_TOOL_NAMES];
