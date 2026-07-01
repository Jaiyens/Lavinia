import { describe, expect, it } from "vitest";
import { pageTransport, walkPortal, type PortalPage, type PortalResponse, type PortalTransport } from "./portal-walk";
import { SourceChangedError } from "./portal-health";

// A fake transport backed by a fixture map keyed on endpoint. Missing endpoints answer 200 [] so the
// walk's optional calls (recent activity, reports, per-handler) are harmless by default.
function fakeTransport(map: Record<string, unknown>, errors: Record<string, number> = {}): PortalTransport {
  const calls: { endpoint: string; params: Record<string, string | number> }[] = [];
  const t: PortalTransport & { calls: typeof calls } = Object.assign(
    async (endpoint: string, params: Record<string, string | number>): Promise<PortalResponse> => {
      calls.push({ endpoint, params });
      if (endpoint in errors) return { status: errors[endpoint] as number, json: { error: "boom" } };
      return { status: 200, json: endpoint in map ? map[endpoint] : [] };
    },
    { calls },
  );
  return t;
}

const HULLERS = [
  { id: 7, name: "Sierra Valley Holding", cropYears: [2024, 2025] },
  { id: 9, name: "Central Cal Hulling", cropYears: [2025] },
];
const HANDLERS = [{ id: 3, name: "Blue Diamond", cropYears: [2025] }];

describe("walkPortal — the SVH-only portal walk", () => {
  it("reads deliveries/runs for SVH only, plus per-handler assignments, and captures every page", async () => {
    const transport = fakeTransport({ "getHullers.php": HULLERS, "getHandlers.php": HANDLERS });
    const result = await walkPortal(transport, { growerId: "23", cropYear: 2025 });

    expect(result.svhHuller.id).toBe(7);
    // 5 account calls + getDeliveries + getRuns (SVH only) + 1 getWebAssignments (one handler) = 8.
    expect(result.pages).toHaveLength(8);

    // Every delivery/run call targeted the SVH huller id, never the other huller (id 9).
    const urls = result.pages.map((p) => p.url);
    expect(urls.some((u) => u.includes("getDeliveries.php") && u.includes("hullerId=7"))).toBe(true);
    expect(urls.some((u) => u.includes("getRuns.php") && u.includes("hullerId=7"))).toBe(true);
    expect(urls.some((u) => u.includes("hullerId=9"))).toBe(false);
    // Handler assignment carried the handler id + the target year.
    expect(urls.some((u) => u.includes("getWebAssignments.php") && u.includes("handlerId=3") && u.includes("cropYear=2025"))).toBe(true);

    // Every captured page is content-addressed JSON.
    for (const page of result.pages) {
      expect(page.contentType).toBe("application/json");
      expect(page.sha).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("raises SourceChangedError when Sierra Valley Holding is absent (never reads another huller)", async () => {
    const transport = fakeTransport({ "getHullers.php": [HULLERS[1]], "getHandlers.php": HANDLERS });
    await expect(walkPortal(transport, { growerId: "23", cropYear: 2025 })).rejects.toBeInstanceOf(
      SourceChangedError,
    );
  });

  it("raises SourceChangedError when a required endpoint errors (portal/session broke)", async () => {
    const transport = fakeTransport({ "getHullers.php": HULLERS }, { "getHullers.php": 500 });
    await expect(walkPortal(transport, { growerId: "23", cropYear: 2025 })).rejects.toMatchObject({
      reason: "endpoint_error",
    });
  });

  it("raises SourceChangedError when no hullers are enumerated", async () => {
    const transport = fakeTransport({ "getHullers.php": [], "getHandlers.php": HANDLERS });
    await expect(walkPortal(transport, { growerId: "23", cropYear: 2025 })).rejects.toMatchObject({
      reason: "no_hullers_enumerated",
    });
  });
});

describe("pageTransport — issues the request from inside the authenticated page", () => {
  it("calls page.evaluate with the API URL and returns its parsed response", async () => {
    const seen: string[] = [];
    const fakePage: PortalPage = {
      url: () => "https://almondlogic.com/portals/grower/index.html?growerId=23",
      evaluate: async <T,>(_fn: (arg: string) => T | Promise<T>, arg: string): Promise<T> => {
        seen.push(arg);
        return { status: 200, json: { ok: true }, raw: '{"ok":true}' } as T;
      },
    };
    const transport = pageTransport(fakePage);
    const res = await transport("getDeliveries.php", { hullerId: 7, growerId: "23", cropYear: 2025 });
    expect(res.status).toBe(200);
    expect(seen[0]).toContain("/api/getDeliveries.php?");
    expect(seen[0]).toContain("hullerId=7");
    expect(seen[0]).toContain("cropYear=2025");
  });
});
