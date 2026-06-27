"use client";

import { CropPackerTable } from "../../crop-packer-table";
import type { PackerTableResult } from "@/lib/almond/tools/results";
import { EmptyResult } from "./empty-result";

// The PackerTable generative-UI result: the pounds-by-packer rows rendered in chat, reusing the
// dashboard's CropPackerTable so the chat and the tab can never drift to a second table. Every pound
// is a field of the tool result (produced by packerRows on the server); this wrapper does NO
// arithmetic — it only maps the readonly tool rows to the component's mutable prop and falls back to
// the explicit empty state.

export function PackerTable({ result }: { result: PackerTableResult }) {
  if (result.kind === "empty") return <EmptyResult reason={result.reason} />;
  return <CropPackerTable rows={[...result.rows]} />;
}
