import { CodeBuddyExecutor } from "./codebuddy-cn.js";

/**
 * CodeBuddyIntlExecutor — talks to https://www.codebuddy.ai/v2/chat/completions
 *
 * Same OpenAI-compatible-but-stream-only gateway behavior as codebuddy-cn:
 * non-stream requests are rejected, and reasoning is surfaced only when the
 * request carries the IDE's OpenAI-style reasoning params. Force stream,
 * guarantee leading system prompt, convert user string to typed blocks, and
 * mirror reasoning_summary exactly like CodeBuddyExecutor.
 */
export class CodeBuddyIntlExecutor extends CodeBuddyExecutor {
  constructor(provider = "codebuddy-intl") {
    super(provider);
  }

  getDefaultSystemPrompt() {
    return "You are CodeBuddy Code.";
  }
}

export default CodeBuddyIntlExecutor;

