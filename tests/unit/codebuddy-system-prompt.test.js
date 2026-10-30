import { describe, it, expect } from "vitest";
import { CodeBuddyExecutor } from "../../open-sse/executors/codebuddy-cn.js";
import { CodeBuddyIntlExecutor } from "../../open-sse/executors/codebuddy-intl.js";

describe("CodeBuddy executors leading system prompt & typed blocks (sbeads-jdz)", () => {
  const executors = [
    { id: "codebuddy-cn", exec: new CodeBuddyExecutor(), defaultPrompt: "You are a helpful AI assistant that helps with software engineering tasks." },
    { id: "codebuddy-intl", exec: new CodeBuddyIntlExecutor(), defaultPrompt: "You are CodeBuddy Code." },
  ];

  for (const { id, exec, defaultPrompt } of executors) {
    describe(id, () => {
      it("guarantees a leading system prompt when incoming messages have no system role", () => {
        const out = exec.transformRequest(
          "deepseek-v4.1-flash",
          { messages: [{ role: "user", content: "Hello" }] },
          false,
          {}
        );

        expect(Array.isArray(out.messages)).toBe(true);
        expect(out.messages.length).toBe(2);
        expect(out.messages[0].role).toBe("system");
        expect(out.messages[0].content).toBe(defaultPrompt);
        expect(out.messages[1].role).toBe("user");
      });

      it("converts user string content into typed blocks [{type:'text', text:...}]", () => {
        const out = exec.transformRequest(
          "deepseek-v4.1-flash",
          { messages: [{ role: "user", content: "Explain quantum computing" }] },
          false,
          {}
        );

        const userMsg = out.messages.find((m) => m.role === "user");
        expect(userMsg).toBeDefined();
        expect(userMsg.content).toEqual([{ type: "text", text: "Explain quantum computing" }]);
      });

      it("preserves user content if it is already an array of typed blocks", () => {
        const existingBlocks = [{ type: "text", text: "Already typed block" }];
        const out = exec.transformRequest(
          "deepseek-v4.1-flash",
          { messages: [{ role: "user", content: existingBlocks }] },
          false,
          {}
        );

        const userMsg = out.messages.find((m) => m.role === "user");
        expect(userMsg.content).toEqual(existingBlocks);
      });

      it("preserves legitimate user system prompt at index 0", () => {
        const customPrompt = "You are an expert Go developer. Always write clean idiomatic Go.";
        const out = exec.transformRequest(
          "deepseek-v4.1-flash",
          {
            messages: [
              { role: "system", content: customPrompt },
              { role: "user", content: "How do channels work?" },
            ],
          },
          false,
          {}
        );

        expect(out.messages[0].role).toBe("system");
        expect(out.messages[0].content).toBe(customPrompt);
        expect(out.messages[1].role).toBe("user");
        expect(out.messages[1].content).toEqual([{ type: "text", text: "How do channels work?" }]);
      });

      it("neutralizes agent-identity system prompts that trip content filters", () => {
        const agentPrompt = "You are Claude Code, Anthropic's official CLI for software development.";
        const out = exec.transformRequest(
          "deepseek-v4.1-flash",
          {
            messages: [
              { role: "system", content: agentPrompt },
              { role: "user", content: "Fix bug in index.js" },
            ],
          },
          false,
          {}
        );

        expect(out.messages[0].role).toBe("system");
        expect(out.messages[0].content).toBe(defaultPrompt);
      });

      it("neutralizes overly long system prompts (>2000 chars)", () => {
        const longPrompt = "A".repeat(2500);
        const out = exec.transformRequest(
          "deepseek-v4.1-flash",
          {
            messages: [
              { role: "system", content: longPrompt },
              { role: "user", content: "Hello" },
            ],
          },
          false,
          {}
        );

        expect(out.messages[0].role).toBe("system");
        expect(out.messages[0].content).toBe(defaultPrompt);
      });

      it("hoists system prompt to index 0 if it was sent after user message", () => {
        const customPrompt = "Translate English to French.";
        const out = exec.transformRequest(
          "deepseek-v4.1-flash",
          {
            messages: [
              { role: "user", content: "Good morning" },
              { role: "system", content: customPrompt },
            ],
          },
          false,
          {}
        );

        expect(out.messages[0].role).toBe("system");
        expect(out.messages[0].content).toBe(customPrompt);
        expect(out.messages[1].role).toBe("user");
      });

      it("handles empty or missing messages gracefully without crashing", () => {
        const outEmpty = exec.transformRequest("deepseek-v4.1-flash", { messages: [] }, false, {});
        expect(outEmpty.messages[0].role).toBe("system");
        expect(outEmpty.messages[0].content).toBe(defaultPrompt);

        const outNone = exec.transformRequest("deepseek-v4.1-flash", {}, false, {});
        expect(outNone.messages[0].role).toBe("system");
        expect(outNone.messages[0].content).toBe(defaultPrompt);
      });

      it("forces stream to true", () => {
        const out = exec.transformRequest(
          "deepseek-v4.1-flash",
          { messages: [{ role: "user", content: "hi" }], stream: false },
          false,
          {}
        );
        expect(out.stream).toBe(true);
      });
    });
  }
});
