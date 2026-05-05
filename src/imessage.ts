import { SDK } from "@photon-ai/advanced-imessage-kit";
import "dotenv/config";

import { chat as preDiagnosisChat } from "./agents/preDiagnosisAgent.js";
import { chat as mealPlanChat } from "./agents/mealPlanAgent.js";
import { saveDocument } from "./database.js";
import { extractText } from "./tools/documentExtractor.js";
import {
  buildMedicationPlanDrafts,
  formatMedicationPlanForConfirmation,
  buildDailySchedule,
  formatDailySchedule,
  type DailyScheduleItem,
  type MedicationPlanDraft,
} from "./tools/medReminderGenerator.js";
import { extractMedicationsFromText } from "./tools/medicationTextExtractor.js";
import { createMedicationReminderSchedule } from "./tools/reminderScheduler.js";

type ConversationStep =
  | "idle"
  | "awaiting_onboarding_choice"
  | "awaiting_input_method"
  | "awaiting_meds_document"
  | "awaiting_combo_document"
  | "awaiting_typed_meds"
  | "awaiting_med_confirmation"
  | "meal_plan_conversation";

type ConversationFlow = "meds_only" | "meal_only" | "combo" | null;

type ConversationState = {
  step: ConversationStep;
  extractedText: string | null;
  preDiagnosisResult: string | null;
  flow: ConversationFlow;
  medicationDrafts: MedicationPlanDraft[] | null;
};

const conversationState = new Map<string, ConversationState>();

function getState(sender: string): ConversationState {
  return conversationState.get(sender) ?? {
    step: "idle",
    extractedText: null,
    preDiagnosisResult: null,
    flow: null,
    medicationDrafts: null,
  };
}

function setState(sender: string, state: ConversationState) {
  conversationState.set(sender, state);
}

const INTRO_MESSAGE =
  "Hi! I'm Ava, your personal health assistant. I can set up medicine reminders from your documents and build meal plans around your health.";

const MENU_MESSAGE =
  "What would you like help with?\n\n" +
  "1. Medicine intake reminders from your documents\n" +
  "2. Meal plan based on your health condition or goal\n" +
  "3. Both — reminders plus a meal plan tailored to your documents\n\n" +
  "Reply 1, 2, or 3.";

const UPLOAD_PROMPT_MESSAGE =
  "Please upload your report, lab result, doctor notes, or medicine list as an image or PDF.";

const INPUT_METHOD_PROMPT =
  "How would you like to share your medications?\n\n" +
  "1. Upload a document (image or PDF)\n" +
  "2. Type them out\n\n" +
  "Reply 1 or 2.";

const TYPED_MEDS_PROMPT =
  "Got it. Please type your medications and supplements, including the dose, how often you take them, and any timing notes (with food, before bed, etc.).\n\n" +
  'Example: "Lisinopril 10mg once daily in the morning. Vitamin D 1000 IU with breakfast. Metformin 500mg twice daily with food."';

async function main() {
  const sdk = SDK({
    serverUrl: process.env.PHOTON_SERVER_URL,
    apiKey: process.env.PHOTON_API_KEY,
  });

  await sdk.connect();

  sdk.on("ready", () => {
    console.log("Health assistant is now listening for iMessages...");
  });

  sdk.on("new-message", async (message) => {
    if (message.isFromMe) return;

    const userText = message.text?.trim() ?? "";
    const attachments = message.attachments ?? [];
    const sender = message.handle?.address?.trim();

    if (!sender) return;
    if (!userText && attachments.length === 0) return;

    const chatGuid = message.chats?.[0]?.guid || `iMessage;-;${sender}`;

    console.log(
      `[${sender}] Received: text="${userText.slice(0, 60)}" attachments=${attachments.length}`
    );

    try {
      const state = getState(sender);

      if (state.step === "idle") {
        await sdk.messages.sendMessage({ chatGuid, message: INTRO_MESSAGE });
        await sdk.messages.sendMessage({ chatGuid, message: MENU_MESSAGE });
        setState(sender, {
          step: "awaiting_onboarding_choice",
          extractedText: null,
          preDiagnosisResult: null,
          flow: null,
          medicationDrafts: null,
        });
        return;
      }

      if (state.step === "awaiting_onboarding_choice") {
        const choice = userText.trim();

        if (choice === "1") {
          await sdk.messages.sendMessage({ chatGuid, message: INPUT_METHOD_PROMPT });
          setState(sender, { ...state, step: "awaiting_input_method", flow: "meds_only" });
          return;
        }

        if (choice === "2") {
          await sdk.messages.sendMessage({
            chatGuid,
            message:
              "Tell me the health condition you're managing, or the body/health goal you want your meals to support.",
          });
          setState(sender, { ...state, step: "meal_plan_conversation", flow: "meal_only" });
          return;
        }

        if (choice === "3") {
          await sdk.messages.sendMessage({ chatGuid, message: INPUT_METHOD_PROMPT });
          setState(sender, { ...state, step: "awaiting_input_method", flow: "combo" });
          return;
        }

        await sdk.messages.sendMessage({
          chatGuid,
          message: "Please reply 1, 2, or 3.",
        });
        return;
      }

      if (state.step === "awaiting_input_method") {
        const choice = userText.trim();

        if (choice === "1") {
          await sdk.messages.sendMessage({ chatGuid, message: UPLOAD_PROMPT_MESSAGE });
          const nextStep =
            state.flow === "combo" ? "awaiting_combo_document" : "awaiting_meds_document";
          setState(sender, { ...state, step: nextStep });
          return;
        }

        if (choice === "2") {
          await sdk.messages.sendMessage({ chatGuid, message: TYPED_MEDS_PROMPT });
          setState(sender, { ...state, step: "awaiting_typed_meds" });
          return;
        }

        await sdk.messages.sendMessage({
          chatGuid,
          message: "Please reply 1 or 2.",
        });
        return;
      }

      if (state.step === "awaiting_meds_document") {
        if (attachments.length === 0) {
          await sdk.messages.sendMessage({
            chatGuid,
            message: "Please upload a document (image or PDF) so I can pull out your medications.",
          });
          return;
        }

        const extractedText = await withTyping(sdk, chatGuid, () =>
          processAttachments(sdk, sender, attachments)
        );
        if (!extractedText.trim()) {
          await sdk.messages.sendMessage({
            chatGuid,
            message: "I couldn't read any text from your uploads. Please try again.",
          });
          return;
        }

        const drafts = buildMedicationPlanDrafts(extractedText);
        await sdk.messages.sendMessage({
          chatGuid,
          message: formatMedicationPlanForConfirmation(drafts),
        });

        setState(sender, {
          ...state,
          step: "awaiting_med_confirmation",
          extractedText,
          medicationDrafts: drafts,
        });
        return;
      }

      if (state.step === "awaiting_combo_document") {
        if (attachments.length === 0) {
          await sdk.messages.sendMessage({
            chatGuid,
            message:
              "Please upload a document (image or PDF) so I can analyze it and plan your reminders plus meals.",
          });
          return;
        }

        const extractedText = await withTyping(sdk, chatGuid, () =>
          processAttachments(sdk, sender, attachments)
        );
        if (!extractedText.trim()) {
          await sdk.messages.sendMessage({
            chatGuid,
            message: "I couldn't read any text from your uploads. Please try again.",
          });
          return;
        }

        const diagnosisReply = await withTyping(sdk, chatGuid, () =>
          preDiagnosisChat(sender, extractedText)
        );
        const cleanDiagnosis = stripMarkdown(diagnosisReply);
        await sdk.messages.sendMessage({ chatGuid, message: cleanDiagnosis });

        const drafts = buildMedicationPlanDrafts(extractedText);
        await sdk.messages.sendMessage({
          chatGuid,
          message: formatMedicationPlanForConfirmation(drafts),
        });

        setState(sender, {
          ...state,
          step: "awaiting_med_confirmation",
          extractedText,
          preDiagnosisResult: cleanDiagnosis,
          medicationDrafts: drafts,
        });
        return;
      }

      if (state.step === "awaiting_typed_meds") {
        if (!userText.trim()) {
          await sdk.messages.sendMessage({
            chatGuid,
            message:
              "Please type your medications and supplements so I can build a reminder schedule.",
          });
          return;
        }

        const drafts = await withTyping(sdk, chatGuid, () =>
          extractMedicationsFromText(userText)
        );

        if (!drafts.length) {
          await sdk.messages.sendMessage({
            chatGuid,
            message:
              "I couldn't pull a clear medication list from that. Try listing each one on its own line with the dose and how often you take it (e.g. \"Lisinopril 10mg once daily\").",
          });
          return;
        }

        let preDiagnosisResult: string | null = null;
        if (state.flow === "combo") {
          const diagnosisReply = await withTyping(sdk, chatGuid, () =>
            preDiagnosisChat(sender, userText)
          );
          preDiagnosisResult = stripMarkdown(diagnosisReply);
          await sdk.messages.sendMessage({ chatGuid, message: preDiagnosisResult });
        }

        await sdk.messages.sendMessage({
          chatGuid,
          message: formatMedicationPlanForConfirmation(drafts),
        });

        setState(sender, {
          ...state,
          step: "awaiting_med_confirmation",
          extractedText: userText,
          preDiagnosisResult,
          medicationDrafts: drafts,
        });
        return;
      }

      if (state.step === "awaiting_med_confirmation") {
        if (userText.trim().toLowerCase() !== "confirm") {
          await sdk.messages.sendMessage({
            chatGuid,
            message:
              'Please reply "confirm" if the medication summary looks right, or tell me what needs to change.',
          });
          return;
        }

        const drafts = state.medicationDrafts;
        if (!drafts || !drafts.length) {
          await sdk.messages.sendMessage({
            chatGuid,
            message:
              "I don't have a confirmed medication list anymore. Please start again.",
          });
          setState(sender, {
            step: "idle",
            extractedText: null,
            preDiagnosisResult: null,
            flow: null,
            medicationDrafts: null,
          });
          return;
        }

        const schedule = buildDailySchedule(drafts);

        if (!schedule.length) {
          await sdk.messages.sendMessage({
            chatGuid,
            message:
              "I couldn't build a daily reminder schedule automatically. Please tell me the times you want for each medication.",
          });
          setState(sender, { ...state, step: "idle", flow: null });
          return;
        }

        await sdk.messages.sendMessage({ chatGuid, message: formatDailySchedule(schedule) });
        await createMedicationReminderSchedule({ sdk, chatGuid, schedule });
        await sdk.messages.sendMessage({
          chatGuid,
          message: buildReminderActivationMessage(schedule),
        });

        if (state.flow === "combo" && state.preDiagnosisResult) {
          const mealPrompt = buildMealPlanPromptFromDiagnosis(
            state.preDiagnosisResult,
            state.extractedText
          );
          const mealReply = await withTyping(sdk, chatGuid, () =>
            mealPlanChat(sender, mealPrompt)
          );
          await sendMealPlanReply(sdk, chatGuid, mealReply);

          setState(sender, { ...state, step: "meal_plan_conversation" });
          return;
        }

        setState(sender, {
          step: "idle",
          extractedText: null,
          preDiagnosisResult: null,
          flow: null,
          medicationDrafts: null,
        });
        return;
      }

      if (state.step === "meal_plan_conversation") {
        let messageForAgent = userText;

        if (attachments.length > 0) {
          const extracted = await withTyping(sdk, chatGuid, () =>
            processAttachments(sdk, sender, attachments)
          );
          messageForAgent = [userText, extracted].filter(Boolean).join("\n\n");
        }

        if (!messageForAgent.trim()) {
          await sdk.messages.sendMessage({
            chatGuid,
            message: "I got your message but couldn't read any usable text. Please try again.",
          });
          return;
        }

        const reply = await withTyping(sdk, chatGuid, () =>
          mealPlanChat(sender, messageForAgent)
        );
        await sendMealPlanReply(sdk, chatGuid, reply);
        return;
      }
    } catch (err) {
      console.error(`[${sender}] Error processing message:`, err);
      await sdk.messages.sendMessage({
        chatGuid,
        message:
          "I'm sorry, I encountered an issue processing your message. Please try again.",
      });
    }
  });

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    await sdk.close();
    process.exit(0);
  });
}

async function processAttachments(
  sdk: any,
  sender: string,
  attachments: any[]
): Promise<string> {
  const sections: string[] = [];

  for (const att of attachments) {
    try {
      const buf = await sdk.attachments.downloadAttachment(att.guid, { original: true });
      const { text, skipped } = await extractText(buf, att.mimeType, att.transferName);

      await saveDocument(
        sender,
        att.transferName,
        att.mimeType,
        buf.length,
        text,
        skipped
      );

      if (skipped) {
        sections.push(`[File: ${att.transferName}] ${skipped}`);
      } else {
        sections.push(`[File: ${att.transferName}]\n${text}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[${sender}] Attachment ${att.guid} failed:`, msg);
      sections.push(`[File: ${att.transferName}] Could not process: ${msg}`);
    }
  }

  return sections.join("\n\n");
}

async function withTyping<T>(
  sdk: any,
  chatGuid: string,
  fn: () => Promise<T>
): Promise<T> {
  const ping = () => sdk.chats.startTyping(chatGuid).catch(() => {});
  await ping();
  const interval = setInterval(ping, 8000);
  try {
    return await fn();
  } finally {
    clearInterval(interval);
    await sdk.chats.stopTyping(chatGuid).catch(() => {});
  }
}

async function sendMealPlanReply(
  sdk: any,
  chatGuid: string,
  reply: { text: string; pdfPath?: string; pdfFileName?: string }
): Promise<void> {
  const text = stripMarkdown(reply.text);
  if (text) {
    await sdk.messages.sendMessage({ chatGuid, message: text });
  }

  if (reply.pdfPath) {
    try {
      await sdk.attachments.sendAttachment({
        chatGuid,
        filePath: reply.pdfPath,
        fileName: reply.pdfFileName ?? "meal-plan.pdf",
      });
    } catch (err) {
      console.error("Failed to send meal plan PDF:", err);
      await sdk.messages.sendMessage({
        chatGuid,
        message:
          "I generated your meal plan PDF but couldn't attach it. Please try again.",
      });
    }
  }
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .trim();
}

function buildReminderActivationMessage(schedule: DailyScheduleItem[]): string {
  if (!schedule.length) {
    return "I couldn't activate reminders because I don't have a confirmed daily schedule yet.";
  }

  const lines: string[] = [];
  lines.push("Your medicine reminders are now active.");
  lines.push("");
  lines.push("At each scheduled time, I'll send you a reminder telling you exactly what to take:");
  lines.push("");

  for (const item of schedule) {
    lines.push(`${item.time.label}  ${formatScheduleLine(item)}`);
  }

  return lines.join("\n");
}

function formatScheduleLine(item: DailyScheduleItem): string {
  const quantity = item.quantityText ? `${item.quantityText} of ` : "";
  return `${quantity}${item.medicationName}`;
}

function buildMealPlanPromptFromDiagnosis(
  preDiagnosisResult: string,
  extractedText: string | null
): string {
  const parts: string[] = [];
  parts.push(
    "Generate a weekly meal plan tailored to the following pre-diagnosis. Respect any dietary constraints implied by the conditions or medications."
  );
  parts.push("");
  parts.push("Pre-diagnosis result:");
  parts.push(preDiagnosisResult);

  if (extractedText?.trim()) {
    parts.push("");
    parts.push("Original document text:");
    parts.push(extractedText.trim());
  }

  return parts.join("\n");
}

main().catch((err) => {
  console.error("Failed to start iMessage integration:", err);
  process.exit(1);
});
