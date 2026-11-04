import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getProviderConnectionById: vi.fn(),
  updateProviderCredentials: vi.fn(),
  refreshGoogleToken: vi.fn(),
}));

vi.mock("@/models", () => ({
  getProviderConnectionById: mocks.getProviderConnectionById,
}));

vi.mock("@/sse/services/tokenRefresh", () => ({
  refreshGoogleToken: mocks.refreshGoogleToken,
  refreshCodexToken: vi.fn(),
  updateProviderCredentials: mocks.updateProviderCredentials,
}));

const { GET } = await import("@/app/api/providers/[id]/models/route.js");
const { getModelsByProviderId } = await import("open-sse/config/providerModels.js");
const { ANTIGRAVITY_IDE_BASE_URL, ANTIGRAVITY_IDE_USER_AGENT } = await import("open-sse/providers/shared.js");
const { ANTIGRAVITY_CONFIG } = await import("@/lib/oauth/constants/oauth");

describe("Antigravity models endpoint resolver", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("dynamically fetches models using ANTIGRAVITY_IDE_BASE_URL and official user-agent", async () => {
    mocks.getProviderConnectionById.mockResolvedValue({
      id: "ag-conn-1",
      provider: "antigravity",
      accessToken: "valid-tok-123",
      refreshToken: "valid-rt-456",
      projectId: "proj-abc",
    });

    global.fetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          models: {
            "gemini-3.8-flash-high": { displayName: "Gemini 3.8 Flash (High)" },
            "claude-opus-5-5-high": { displayName: "Claude Opus 5.5 (High)" },
            "internal-debug-model": { displayName: "Internal", isInternal: true },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const req = new Request("http://localhost/api/providers/ag-conn-1/models");
    const res = await GET(req, { params: Promise.resolve({ id: "ag-conn-1" }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.provider).toBe("antigravity");
    expect(data.connectionId).toBe("ag-conn-1");
    expect(data.models).toEqual([
      { id: "gemini-3.8-flash-high", name: "Gemini 3.8 Flash (High)" },
      { id: "claude-opus-5-5-high", name: "Claude Opus 5.5 (High)" },
    ]);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [fetchUrl, fetchOptions] = global.fetch.mock.calls[0];
    expect(fetchUrl).toBe(`${ANTIGRAVITY_IDE_BASE_URL}/v1internal:fetchAvailableModels`);
    expect(fetchOptions.method).toBe("POST");
    expect(fetchOptions.headers["Authorization"]).toBe("Bearer valid-tok-123");
    expect(fetchOptions.headers["User-Agent"]).toBe(ANTIGRAVITY_IDE_USER_AGENT);
    expect(JSON.parse(fetchOptions.body)).toEqual({ project: "proj-abc" });
  });

  it("refreshes token on 401 and retries with refreshed credentials", async () => {
    mocks.getProviderConnectionById.mockResolvedValue({
      id: "ag-conn-refresh",
      provider: "antigravity",
      accessToken: "expired-tok",
      refreshToken: "rt-refresh-999",
      providerSpecificData: { projectId: "proj-refreshed" },
    });

    mocks.refreshGoogleToken.mockResolvedValue({
      accessToken: "new-access-tok",
      refreshToken: "new-rt",
      expiresIn: 3600,
    });

    // First call returns 401
    global.fetch
      .mockResolvedValueOnce(new Response("Unauthorized", { status: 401 }))
      // Second call after refresh returns models
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            models: [
              { id: "gemini-4-argon-high", displayName: "Gemini 4 Argon" },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const req = new Request("http://localhost/api/providers/ag-conn-refresh/models");
    const res = await GET(req, { params: Promise.resolve({ id: "ag-conn-refresh" }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.models).toEqual([
      { id: "gemini-4-argon-high", name: "Gemini 4 Argon" },
    ]);

    expect(mocks.refreshGoogleToken).toHaveBeenCalledWith(
      "rt-refresh-999",
      ANTIGRAVITY_CONFIG.clientId,
      ANTIGRAVITY_CONFIG.clientSecret
    );
    expect(mocks.updateProviderCredentials).toHaveBeenCalledWith("ag-conn-refresh", {
      accessToken: "new-access-tok",
      refreshToken: "new-rt",
      expiresIn: 3600,
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[1][1].headers["Authorization"]).toBe("Bearer new-access-tok");
    expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ project: "proj-refreshed" });
  });

  it("falls back to static catalog when upstream call fails", async () => {
    mocks.getProviderConnectionById.mockResolvedValue({
      id: "ag-conn-fail",
      provider: "antigravity",
      accessToken: "tok-fail",
      refreshToken: "rt-fail",
    });

    global.fetch.mockResolvedValueOnce(new Response("Internal Server Error", { status: 500 }));

    const req = new Request("http://localhost/api/providers/ag-conn-fail/models");
    const res = await GET(req, { params: Promise.resolve({ id: "ag-conn-fail" }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    const staticCount = getModelsByProviderId("antigravity").length;
    expect(data.models.length).toBe(staticCount);
    expect(data.models.length).toBeGreaterThan(0);
    expect(data.warning).toContain("Failed to fetch Antigravity models");
  });

  it("falls back to static catalog when upstream returns empty models array", async () => {
    mocks.getProviderConnectionById.mockResolvedValue({
      id: "ag-conn-empty",
      provider: "antigravity",
      accessToken: "tok-empty",
    });

    global.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ models: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const req = new Request("http://localhost/api/providers/ag-conn-empty/models");
    const res = await GET(req, { params: Promise.resolve({ id: "ag-conn-empty" }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    const staticCount = getModelsByProviderId("antigravity").length;
    expect(data.models.length).toBe(staticCount);
    expect(data.warning).toBe("Antigravity returned no live models; using static catalog.");
  });

  it("returns 401 when no accessToken is present", async () => {
    mocks.getProviderConnectionById.mockResolvedValue({
      id: "ag-conn-no-tok",
      provider: "antigravity",
    });

    const req = new Request("http://localhost/api/providers/ag-conn-no-tok/models");
    const res = await GET(req, { params: Promise.resolve({ id: "ag-conn-no-tok" }) });
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("No valid token found");
  });
});
