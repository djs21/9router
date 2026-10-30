import { DefaultExecutor } from "./default.js";

/**
 * CodeBuddyExecutor — talks to https://copilot.tencent.com/v2/chat/completions
 *
 * CodeBuddy is OpenAI-compatible but rejects non-stream chat requests
 * (HTTP 400, code 11101 "Non-stream chat request is currently not supported").
 * The same-format (openai→openai) translator path leaves body.stream as the
 * client sent it, so we force it true here — 9router still re-aggregates the
 * SSE into a JSON response for non-streaming clients.
 */
const NEUTRAL_PROMPT = "You are a helpful AI assistant that helps with software engineering tasks.";
const AGENT_PATTERN = /you are claude code|claude.?code.+official.+cli|anthropic.+official.+cli|anxthxropic.+official.+cli|you are (?:cursor|windsurf|cline|aider|continue|copilot|cody)|you are an? (?:ai )?(?:coding |code )?agent|cc_entrypoint\s*=\s*(?:cli|vscode|jetbrains|gui)|claude.?code.+issues|give feedback.+claude.?code|you are .{0,30}(?:powerful )?ai agent|orchestration capabilities|OhMyOpenCode|<agent-identity>|<Role>|<Behavior_Instructions>/i;

export function flattenContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((b) => (b && typeof b.text === "string" ? b.text : "")).join("\n");
  }
  return "";
}

/**
 * Normalizes messages for CodeBuddy gateways (CN and Intl):
 * - Guarantees leading message is role: "system" (prevents 11128 'first message is not system prompt').
 * - Preserves clean user system prompts; neutralizes agent prompts / prompts > 2000 chars.
 * - If no system message exists, prepends defaultPrompt.
 * - Converts user messages with string content into typed blocks [{ type: "text", text: ... }].
 */
export function normalizeCodeBuddyMessages(messages, defaultPrompt = NEUTRAL_PROMPT) {
  const source = Array.isArray(messages) ? messages.filter((m) => m && typeof m === "object") : [];
  const systemMessages = [];
  const nonSystemMessages = [];

  for (const msg of source) {
    if (["system", "developer"].includes(msg.role)) {
      systemMessages.push(msg);
    } else {
      nonSystemMessages.push(msg);
    }
  }

  let leadingSystemContent = defaultPrompt;
  if (systemMessages.length > 0) {
    const cleanSystemMessages = [];
    for (const sm of systemMessages) {
      const text = flattenContent(sm.content);
      if (text && text.length <= 2000 && !AGENT_PATTERN.test(text)) {
        cleanSystemMessages.push(sm);
      }
    }
    if (cleanSystemMessages.length === 1) {
      leadingSystemContent = cleanSystemMessages[0].content;
    } else if (cleanSystemMessages.length > 1) {
      leadingSystemContent = cleanSystemMessages.map((sm) => flattenContent(sm.content)).join("\n\n");
    } else {
      leadingSystemContent = defaultPrompt;
    }
  }

  const normalized = [{ role: "system", content: leadingSystemContent }];

  for (const msg of nonSystemMessages) {
    if (msg.role === "user" && typeof msg.content === "string") {
      normalized.push({ ...msg, content: [{ type: "text", text: msg.content }] });
    } else {
      normalized.push({ ...msg });
    }
  }

  return normalized;
}

export class CodeBuddyExecutor extends DefaultExecutor {
  constructor(provider = "codebuddy-cn") {
    super(provider);
  }

  getDefaultSystemPrompt() {
    return NEUTRAL_PROMPT;
  }

  transformRequest(model, body, stream, credentials) {
    const transformed = super.transformRequest(model, body, stream, credentials);
    transformed.stream = true;

    transformed.messages = normalizeCodeBuddyMessages(
      transformed.messages,
      this.getDefaultSystemPrompt()
    );

    // CodeBuddy only surfaces model reasoning when the request carries the CLI's
    // OpenAI-style params: reasoning_effort + reasoning_summary:"auto". 9router's
    // thinking pipeline sets reasoning_effort only when the client asks, and never
    // sets reasoning_summary — so reasoning never shows. Mirror the CLI here.
    const eff = transformed.reasoning_effort;
    if (eff === "none" || eff === "off") {
      delete transformed.reasoning_effort; // gateway has no "none" — just omit
    } else if (eff) {
      // Client explicitly asked for reasoning — mirror the CLI's reasoning_summary
      // so CodeBuddy surfaces the model's reasoning.
      transformed.reasoning_summary = "auto";
    }
    // No reasoning requested: leave both unset. Forcing reasoning_effort:"medium"
    // + reasoning_summary on plain requests makes CodeBuddy trip its content
    // filter and return an error (#2071).
    return transformed;
  }
  parseError(response, bodyText) {
    if (bodyText) {
      try {
        const data = JSON.parse(bodyText);
        const msg = data?.msg || data?.message || data?.error?.message || "";
        if (data?.code === 6004 || /超出频率限制|frequency limit|限额/i.test(msg)) {
          let resetsAtMs = null;
          const match = msg.match(/(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:\s*UTC\+?([0-9:]+))?/i);
          if (match) {
            const dp = match[1];
            const tp = match[2];
            const tz = match[3]
              ? (match[3].includes(":") ? (match[3].startsWith("+") ? match[3] : `+${match[3]}`) : `+${match[3].padStart(2, "0")}:00`)
              : "+08:00";
            const dt = new Date(`${dp}T${tp}${tz}`);
            if (!isNaN(dt.getTime())) resetsAtMs = dt.getTime();
          }
          return {
            status: 429,
            message: msg || "CodeBuddy frequency limit (6004)",
            resetsAtMs,
          };
        }
      } catch {}
    }
    return super.parseError(response, bodyText);
  }
}

export default CodeBuddyExecutor;
