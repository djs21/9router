import { describe, it, expect } from "vitest";
import { PROVIDERS } from "open-sse/config/providers.js";
import { getExecutor } from "open-sse/executors/index.js";

// The CodeBuddy gateways (CN + intl) run a per-request channel check. Without
// the official plugin's request/conversation identifiers upstream rejects the
// call with 400 / 11128 "request illegal" ("failed channel verification").
// These tests lock the header wiring so the ids cannot silently disappear.
const REQUIRED = [
  "X-Request-ID",
  "X-Conversation-ID",
  "X-Conversation-Request-ID",
  "X-Conversation-Message-ID",
];

const STATIC_REQUIRED = [
  "User-Agent",
  "X-Product",
  "X-IDE-Type",
  "X-IDE-Name",
  "x-requested-with",
  "x-codebuddy-request",
];

const CREDS = { accessToken: "TESTTOKEN", apiKey: null };

function buildHeaders(id, extraCreds = {}) {
  const executor = getExecutor(id);
  const baseUrl = PROVIDERS[id]?.baseUrl || (id === "cbai" ? PROVIDERS["codebuddy-intl"]?.baseUrl : PROVIDERS["codebuddy-cn"]?.baseUrl);
  return executor.buildHeaders({ ...CREDS, ...extraCreds }, true, baseUrl, "deepseek-v4.1-flash", {});
}

describe("codebuddy channel headers", () => {
  for (const id of ["codebuddy-intl", "codebuddy-cn", "cbai", "cbcn"]) {
    describe(id, () => {
      it("sends the plugin request/conversation ids", () => {
        const headers = buildHeaders(id);
        for (const key of REQUIRED) {
          expect(typeof headers[key], `${id} must send ${key}`).toBe("string");
          expect(headers[key].length).toBeGreaterThan(0);
        }
      });

      it("sends all required static client identity headers", () => {
        const headers = buildHeaders(id);
        for (const key of STATIC_REQUIRED) {
          expect(typeof headers[key], `${id} must send static header ${key}`).toBe("string");
          expect(headers[key].length).toBeGreaterThan(0);
        }
        expect(headers["User-Agent"]).toContain("CodeBuddy");
        expect(headers["x-codebuddy-request"]).toBe("1");
        expect(headers["x-requested-with"]).toBe("XMLHttpRequest");
        expect(headers["X-Product"]).toBe("SaaS");
      });

      it("reuses one request id across the request/conversation pair", () => {
        const headers = buildHeaders(id);
        expect(headers["X-Request-ID"]).toBe(headers["X-Conversation-Request-ID"]);
        expect(headers["X-Conversation-ID"]).not.toBe(headers["X-Conversation-Message-ID"]);
      });

      it("still applies the bearer token after the hook runs", () => {
        expect(buildHeaders(id).Authorization).toBe("Bearer TESTTOKEN");
      });

      it("issues fresh ids per request", () => {
        const a = buildHeaders(id);
        const b = buildHeaders(id);
        expect(a["X-Request-ID"]).not.toBe(b["X-Request-ID"]);
        expect(a["X-Conversation-ID"]).not.toBe(b["X-Conversation-ID"]);
      });

      it("preserves channel verification headers when runtimeTransport has no explicit hooks", () => {
        const headers = buildHeaders(id, {
          runtimeTransport: { format: "openai", baseUrl: "https://example.com" },
        });
        for (const key of REQUIRED) {
          expect(typeof headers[key], `${id} must send ${key} under runtimeTransport`).toBe("string");
        }
        expect(headers["x-codebuddy-request"]).toBe("1");
      });
    });
  }
});

