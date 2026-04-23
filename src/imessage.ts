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
} from "./tools/medReminderGenerator.js";
import { createMedicationReminderSchedule } from "./tools/reminderScheduler.js";

type ConversationStep =
  | "idle"
  | "awaiting_onboarding_choice"
  | "awaiting_meds_document"
  | "awaiting_combo_document"
  | "awaiting_med_confirmation"
  | "meal_plan_conversation";

type ConversationFlow = "meds_only" | "meal_only" | "combo" | null;

type ConversationState = {
  step: ConversationStep;
  extractedText: string | null;
  preDiagnosisResult: string | null;
  flow: ConversationFlow;
};

const conversationState = new Map<string, ConversationState>();

function getState(sender: string): ConversationState {
  return conversationState.get(sender) ?? {
    step: "idle",
    extractedText: null,
    preDiagnosisResult: null,
    flow: null,
  };
}

function setState(sender: string, state: ConversationState) {
  conversationState.set(sender, state);
}

const INTRO_MESSAGE =
  "Hi! I'm Eva, your personal health assistant. I can set up medicine reminders from your documents and build meal plans around your health.";

const MENU_MESSAGE =
  "What would you like help with?\n\n" +
  "1. Medicine intake reminders from your documents\n" +
  "2. Meal plan based on your health condition or goal\n" +
  "3. Both — reminders plus a meal plan tailored to your documents\n\n" +
  "Reply 1, 2, or 3.";

const UPLOAD_PROMPT_MESSAGE =
  "Please upload your report, lab result, doctor notes, or medicine list as an image or PDF.";

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
        });
        return;
      }

      if (state.step === "awaiting_onboarding_choice") {
        const choice = userText.trim();

        if (choice === "1") {
          await sdk.messages.sendMessage({ chatGuid, message: UPLOAD_PROMPT_MESSAGE });
          setState(sender, { ...state, step: "awaiting_meds_document", flow: "meds_only" });
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
          await sdk.messages.sendMessage({ chatGuid, message: UPLOAD_PROMPT_MESSAGE });
          setState(sender, { ...state, step: "awaiting_combo_document", flow: "combo" });
          return;
        }

        await sdk.messages.sendMessage({
          chatGuid,
          message: "Please reply 1, 2, or 3.",
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

        const extractedText = await processAttachments(sdk, sender, attachments);
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

        const extractedText = await processAttachments(sdk, sender, attachments);
        if (!extractedText.trim()) {
          await sdk.messages.sendMessage({
            chatGuid,
            message: "I couldn't read any text from your uploads. Please try again.",
          });
          return;
        }

        const diagnosisReply = await preDiagnosisChat(sender, extractedText);
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

        if (!state.extractedText) {
          await sdk.messages.sendMessage({
            chatGuid,
            message:
              "I don't have the prescription text anymore. Please upload the document again.",
          });
          setState(sender, {
            step: "idle",
            extractedText: null,
            preDiagnosisResult: null,
            flow: null,
          });
          return;
        }

        const drafts = buildMedicationPlanDrafts(state.extractedText);
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
          const mealReply = await mealPlanChat(sender, mealPrompt);
          await sdk.messages.sendMessage({
            chatGuid,
            message: stripMarkdown(mealReply),
          });

          setState(sender, { ...state, step: "meal_plan_conversation" });
          return;
        }

        setState(sender, {
          step: "idle",
          extractedText: null,
          preDiagnosisResult: null,
          flow: null,
        });
        return;
      }

      if (state.step === "meal_plan_conversation") {
        let messageForAgent = userText;

        if (attachments.length > 0) {
          const extracted = await processAttachments(sdk, sender, attachments);
          messageForAgent = [userText, extracted].filter(Boolean).join("\n\n");
        }

        if (!messageForAgent.trim()) {
          await sdk.messages.sendMessage({
            chatGuid,
            message: "I got your message but couldn't read any usable text. Please try again.",
          });
          return;
        }

        const reply = await mealPlanChat(sender, messageForAgent);
        await sdk.messages.sendMessage({
          chatGuid,
          message: stripMarkdown(reply),
        });
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
