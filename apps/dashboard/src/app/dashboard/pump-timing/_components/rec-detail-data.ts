// Server-side loader for a recommendation's detail view. Pulls the rec and, from its
// action.params, the meter it concerns plus that meter's account, ranch(es), and billing
// history for the evidence and charts. Shared by the full detail page and the intercepting
// modal so the two render identical content from one query path. Returns null when the rec
// does not exist (the caller renders notFound).

import type { PrismaClient } from "@prisma/client";

type Params = Record<string, unknown>;

function paramsOf(action: unknown): Params {
  if (action && typeof action === "object" && "params" in action) {
    const p = (action as { params?: unknown }).params;
    if (p && typeof p === "object") return p as Params;
  }
  return {};
}

function pumpIdOf(params: Params): string | null {
  if (typeof params.pumpId === "string") return params.pumpId;
  if (Array.isArray(params.pumpIds) && typeof params.pumpIds[0] === "string") {
    return params.pumpIds[0];
  }
  return null;
}

export async function loadRecDetail(prisma: PrismaClient, recId: string, farmId: string) {
  // Farm-scoped: the rec id arrives in the URL, so re-check it belongs to the CALLER'S own
  // farm. Never findUnique by bare id - that let any rec (and, via the pump second-hop
  // below, any farm's meter / PG&E account / billing) leak cross-farm. The pump is loaded
  // the same farm-scoped way so the second hop cannot pivot into another farm's meter.
  const rec = await prisma.recommendation.findFirst({ where: { id: recId, farmId } });
  if (!rec) return null;

  const params = paramsOf(rec.action);
  const pumpId = pumpIdOf(params);
  const pump = pumpId
    ? await prisma.pump.findFirst({
        where: { id: pumpId, farmId },
        include: {
          account: true,
          blocks: { select: { id: true, name: true } },
          billingPeriods: { orderBy: { close: "asc" } },
        },
      })
    : null;

  return { rec, params, pump };
}

export type RecDetailData = NonNullable<Awaited<ReturnType<typeof loadRecDetail>>>;
