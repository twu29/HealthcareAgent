import { SDK } from "@photon-ai/advanced-imessage-kit";
import "dotenv/config";

import { chat } from "./agents/preDiagnosisAgent.js";
import { saveDocument } from "./database.js";
import { extractText } from "./tools/documentExtractor.js";

type IncomingAttachmentLike = {
  guid?: string | null;
  mimeType?: string | null;
  transferName?: string | null;
};

type IncomingMessageLike = {
  isFromMe?: boolean;
  text?: string | null;
  handle?: {
    address?: string | null;
  } | null;
  chats?: Array<{
    guid?: string | null;
  }> | null;
  attachments?: IncomingAttachmentLike[] | null;
};

async function main() {
  const sdk = SDK({
    serverUrl: process.env.PHOTON_SERVER_URL,
    apiKey: process.env.PHOTON_API_KEY,
  });

  await sdk.connect();

  sdk.on("ready", () => {
    console.log("Meal planning agent is now listening for iMessages...");
  });

  sdk.on("new-message", async (message: IncomingMessageLike) => {
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
      const extractedSections: string[] = [];

      for (const att of attachments) {
        if (!att?.guid) {
          extractedSections.push(
            `[File: ${att?.transferName ?? "unknown"}] Could not process: missing attachment guid`
          );
          continue;
        }

        try {
          console.log(
            `[${sender}] Downloading attachment: ${att.transferName ?? att.guid}`
          );

          const buf = await sdk.attachments.downloadAttachment(att.guid, {
            original: true,
            force: false,
          });

          const fileName = att.transferName ?? att.guid;
          const mimeType = att.mimeType ?? null;

          const { text, skipped } = await extractText(
            buf,
            mimeType,
            fileName
          );

          await saveDocument(
            sender,
            fileName,
            mimeType,
            buf.length,
            text,
            skipped
          );

          if (skipped) {
            extractedSections.push(`[File: ${fileName}] ${skipped}`);
          } else if (text?.trim()) {
            extractedSections.push(`[File: ${fileName}]\n${text.trim()}`);
          } else {
            extractedSections.push(
              `[File: ${fileName}] No readable text was extracted.`
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `[${sender}] Attachment ${att.guid} failed:`,
            msg
          );
          extractedSections.push(
            `[File: ${att.transferName ?? att.guid}] Could not process: ${msg}`
          );
        }
      }

      const messageForAgent = buildMessageForAgent(userText, extractedSections);

      if (!messageForAgent.trim()) {
        await sdk.messages.sendMessage({
          chatGuid,
          message:
            "I received your message, but I could not extract any usable text from it yet. Please try pasting the text directly.",
        });
        return;
      }

      console.log(
        `[${sender}] Sending to agent. chars=${messageForAgent.length}`
      );

      const reply = await chat(sender, messageForAgent);
      const cleanReply = stripMarkdown(reply);

      console.log(
        `[${sender}] Replying: ${cleanReply.substring(0, 100)}...`
      );

      await sdk.messages.sendMessage({
        chatGuid,
        message: cleanReply,
      });
      
      await sdk.messages.sendMessage({
        chatGuid,
        message:
          "What would you like me to help with next?\n\n1. Medicine intake reminder\n2. Weekly meal plan generator\n\nReply with 1 or 2.",
      });
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

function buildMessageForAgent(
  userText: string,
  extractedSections: string[]
): string {
  const parts: string[] = [];

  if (userText.trim()) {
    parts.push(userText.trim());
  }

  if (extractedSections.length > 0) {
    parts.push(...extractedSections);
  }

  return parts.join("\n\n").trim();
}

function stripMarkdown(value: string): string {
  return value
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1")
    .trim();
}

main().catch((err) => {
  console.error("Failed to start iMessage integration:", err);
  process.exit(1);
});