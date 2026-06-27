"use client";

import { CropYoyChart } from "../../crop-yoy-chart";
import type { YoYChartResult } from "@/lib/almond/tools/results";
import { EmptyResult } from "./empty-result";

// The YoYChart generative-UI result: the year-over-year bars rendered in chat, reusing the
// dashboard's CropYoyChart (which itself renders through the shared shadcn/recharts bar chart) so the
// chat chart and the tab chart can never diverge. Every pound is a field of the tool result (produced
// by cropYearBars on the server); this wrapper does NO arithmetic — it maps the readonly bars to the
// component's mutable prop and falls back to the explicit empty state.

export function YoYChart({ result }: { result: YoYChartResult }) {
  if (result.kind === "empty") return <EmptyResult reason={result.reason} />;
  return <CropYoyChart bars={[...result.bars]} />;
}
