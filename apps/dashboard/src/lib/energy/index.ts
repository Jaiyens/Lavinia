// Pure energy calculations live here (Phase 1+). No UI and no DB imports, this
// is the provably-correct core, unit-tested with colocated *.test.ts files.
export * from "./types";
export * from "./demand";
export * from "./billing";
export * from "./peak";
export * from "./classify";
export * from "./recommend";
// The Pump-Timing levers: each emits Recommendations in the shared grammar.
export * from "./retrospective";
export * from "./coincident";
export * from "./cycle-edge";
export * from "./off-peak";
export * from "./reconcile";
export * from "./bill-audit";
// Rate optimization (the headline) + solar/NEM checks.
export * from "./rates";
export * from "./rate-compare";
export * from "./solar-nem";
