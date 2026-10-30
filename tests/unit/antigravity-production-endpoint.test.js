import { describe, it, expect, beforeEach, afterEach } from "vitest";
import antigravity from "../../open-sse/providers/registry/antigravity.js";
import {
  ANTIGRAVITY_PROD_BASE_URL,
  ANTIGRAVITY_CANARY_BASE_URL,
  ANTIGRAVITY_DAILY_BASE_URL,
  ANTIGRAVITY_IDE_BASE_URL,
  resolveAntigravityBaseUrl,
} from "../../open-sse/providers/shared.js";

describe("Antigravity Production Endpoint Migration (sbeads-y6r)", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("Base URL Constants and Resolution (sbeads-vfi)", () => {
    it("defines the Google production and canary hosts correctly", () => {
      expect(ANTIGRAVITY_PROD_BASE_URL).toBe("https://cloudcode-pa.googleapis.com");
      expect(ANTIGRAVITY_CANARY_BASE_URL).toBe("https://daily-cloudcode-pa.googleapis.com");
      expect(ANTIGRAVITY_DAILY_BASE_URL).toBe("https://daily-cloudcode-pa.googleapis.com");
    });

    it("defaults to production host when no env override is present", () => {
      delete process.env.ANTIGRAVITY_BASE_URL;
      delete process.env.ANTIGRAVITY_ENV;
      expect(resolveAntigravityBaseUrl()).toBe(ANTIGRAVITY_PROD_BASE_URL);
    });

    it("respects process.env.ANTIGRAVITY_BASE_URL override", () => {
      process.env.ANTIGRAVITY_BASE_URL = "https://custom-proxy.internal";
      expect(resolveAntigravityBaseUrl()).toBe("https://custom-proxy.internal");
    });

    it("switches to canary when ANTIGRAVITY_ENV is set to canary or daily", () => {
      delete process.env.ANTIGRAVITY_BASE_URL;

      process.env.ANTIGRAVITY_ENV = "canary";
      expect(resolveAntigravityBaseUrl()).toBe(ANTIGRAVITY_CANARY_BASE_URL);

      process.env.ANTIGRAVITY_ENV = "daily";
      expect(resolveAntigravityBaseUrl()).toBe(ANTIGRAVITY_CANARY_BASE_URL);
    });
  });

  describe("Registry Transport Base URLs & Endpoints Alignment (sbeads-rlc, sbeads-7n6)", () => {
    it("configures production host as primary index 0 and canary as secondary index 1", () => {
      expect(antigravity.transport.baseUrls[0]).toBe("https://cloudcode-pa.googleapis.com");
      expect(antigravity.transport.baseUrls[1]).toBe("https://daily-cloudcode-pa.googleapis.com");
      expect(antigravity.transport.baseUrls.length).toBe(2);
    });

    it("aligns quotaApiUrl and quotaSummaryApiUrl with the production host", () => {
      expect(antigravity.transport.usage.quotaApiUrl).toBe(
        "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels"
      );
      expect(antigravity.transport.usage.quotaSummaryApiUrl).toBe(
        "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary"
      );
      expect(antigravity.transport.usage.loadProjectApiUrl).toBe(
        "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist"
      );
    });

    it("aligns oauth apiEndpoint, loadCodeAssistEndpoint, and onboardUserEndpoint with production", () => {
      expect(antigravity.oauth.apiEndpoint).toBe("https://cloudcode-pa.googleapis.com");
      expect(antigravity.oauth.loadCodeAssistEndpoint).toBe(
        "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist"
      );
      expect(antigravity.oauth.onboardUserEndpoint).toBe(
        "https://cloudcode-pa.googleapis.com/v1internal:onboardUser"
      );
    });

    it("aligns searchViaChat endpoint with the production host", () => {
      expect(antigravity.searchViaChat.endpoint).toBe(
        "https://cloudcode-pa.googleapis.com/v1internal:generateContent"
      );
    });
  });
});
