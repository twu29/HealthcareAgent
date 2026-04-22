import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import {
  medicationGuidanceToolDef,
  medicationGuidanceSearch,
} from "../tools/medicationGuidanceTool.js";
import type { MedicationGuidanceInput } from "../tools/medicationGuidanceTypes.js";
import { saveMessage, getHistory } from "../database.js";

const client = new Anthropic();

const MODEL_NAME = "claude-sonnet-4-5-20250929";
const MAX_HISTORY = 30;

export const WELCOME_MESSAGE =
  "Hi! I'm your medication-aware nutrition assistant. You can upload a prescription or medication document, type a medication name, or describe the nutrition support you need.";

const SYSTEM_PROMPT = `You are a medication-aware nutrition assistant.

Your job is to help users understand food and nutrition guidance related to:
1) medications they mention
2) medication instructions they paste
3) medication-related food questions

You are NOT a doctor, pharmacist, or dietitian.
Do not diagnose, prescribe, or change treatment plans.
Do not tell users to start, stop, increase, or decrease medication doses.

Use the medication guidance tool whenever medication-specific facts are needed.
Do not invent medication-food interaction facts without tool support.

Safety rules:
- If the user describes severe emergency symptoms, tell them to seek urgent medical care or call emergency services right away.
- If medication identification is uncertain, say so clearly.
- If document text is incomplete or messy, be transparent about uncertainty.
- Keep advice educational, practical, and conservative.

Response style:
- calm, clear, supportive
- plain language
- short paragraphs
- do not overwhelm the user

When helpful, structure medication-related answers as:
1) What I found
2) Food guidance
3) What to keep in mind

Reply in the same language as the user.`;

type NormalizedHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

const tools: Anthropic.Tool[] = [medicationGuidanceToolDef];

const toolHandlers: Record<
  string,
  (input: unknown) => Promise<unknown>
> = {
  [medicationGuidanceToolDef.name]: async (input: unknown) => {
    return medicationGuidanceSearch(input as MedicationGuidanceInput);
  },
};

export async function chat(sender: string, userMessage: string): Promise<string> {
  const trimmedMessage = userMessage.trim();

  if (!trimmedMessage) {
    return "I didn’t receive any text to analyze yet.";
  }

  const rawHistory = await Promise.resolve(getHistory(sender, MAX_HISTORY));
  console.log("[agent] raw history:", rawHistory);

  const messages = buildMessagesFromHistory(rawHistory);

  messages.push({
    role: "user",
    content: trimmedMessage,
  });

  saveMessage(sender, "user", trimmedMessage);

  while (true) {
    const response = await client.messages.create({
      model: MODEL_NAME,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    if (response.stop_reason === "tool_use") {
      messages.push({
        role: "assistant",
        content: response.content,
      });

      const toolResults = await runToolCalls(response.content);

      messages.push({
        role: "user",
        content: toolResults,
      });

      continue;
    }

    const reply = extractTextResponse(response.content) || fallbackReply();
    saveMessage(sender, "assistant", reply);
    return reply;
  }
}

function buildMessagesFromHistory(rawHistory: unknown): Anthropic.MessageParam[] {
  const normalized = normalizeHistory(rawHistory);

  return normalized.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

function normalizeHistory(rawHistory: unknown): NormalizedHistoryMessage[] {
  if (!Array.isArray(rawHistory)) {
    console.warn("[agent] getHistory did not return an array:", rawHistory);
    return [];
  }

  const normalized: NormalizedHistoryMessage[] = [];

  for (const item of rawHistory) {
    if (!item || typeof item !== "object") continue;

    const row = item as Record<string, unknown>;

    const content =
      typeof row.content === "string"
        ? row.content
        : typeof row.text === "string"
          ? row.text
          : null;

    if (!content?.trim()) continue;

    let role: "user" | "assistant" | null = null;

    if (row.role === "user" || row.role === "assistant") {
      role = row.role;
    } else if (typeof row.role === "string") {
      const lowered = row.role.toLowerCase();
      if (lowered === "user" || lowered === "assistant") {
        role = lowered;
      }
    }

    if (!role && typeof row.sender === "string") {
      const loweredSender = row.sender.toLowerCase();
      if (loweredSender === "user") role = "user";
      if (loweredSender === "assistant" || loweredSender === "bot") {
        role = "assistant";
      }
    }

    if (!role) continue;

    normalized.push({
      role,
      content: content.trim(),
    });
  }

  return normalized;
}

async function runToolCalls(
  contentBlocks: Anthropic.ContentBlock[],
): Promise<Anthropic.ToolResultBlockParam[]> {
  const toolResults: Anthropic.ToolResultBlockParam[] = [];

  for (const block of contentBlocks) {
    if (block.type !== "tool_use") continue;

    const handler = toolHandlers[block.name];

    if (!handler) {
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: `Error: No handler registered for tool "${block.name}"`,
        is_error: true,
      });
      continue;
    }

    try {
      const result = await handler(block.input);

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
      });
    } catch (err) {
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: `Error: ${err instanceof Error ? err.message : String(err)}`,
        is_error: true,
      });
    }
  }

  return toolResults;
}

function extractTextResponse(contentBlocks: Anthropic.ContentBlock[]): string {
  return contentBlocks
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function fallbackReply(): string {
  return "I could not generate a clear response yet. Please try rephrasing your question or send the medication name or document text.";
}