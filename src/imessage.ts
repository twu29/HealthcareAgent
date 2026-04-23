import { SDK } from "@photon-ai/advanced-imessage-kit";
import { chat } from "./agents/mealPlanAgent.js";
import { saveDocument } from "./database.js";
import { extractText } from "./tools/documentExtractor.js";
import "dotenv/config";

async function main() {
  const sdk = SDK({
    serverUrl: process.env.PHOTON_SERVER_URL,
    apiKey: process.env.PHOTON_API_KEY,
  });

  await sdk.connect();

  sdk.on("ready", () => {
    console.log("Meal planning agent is now listening for iMessages...");
  });

  sdk.on("new-message", async (message) => {
    if (message.isFromMe) return;

    const userText = message.text?.trim() ?? "";
    const attachments = message.attachments ?? [];

    if (!userText && attachments.length === 0) return;

    const sender = message.handle?.address;
    if (!sender) return;

    const chatGuid = message.chats?.[0]?.guid || `iMessage;-;${sender}`;

    console.log(
      `[${sender}] Received: text="${userText.slice(0, 60)}" attachments=${attachments.length}`
    );

    try {
      const extractedSections: string[] = [];

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
            extractedSections.push(`[File: ${att.transferName}] ${skipped}`);
          } else {
            extractedSections.push(
              `[File: ${att.transferName}]\n${text}`
            );
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[${sender}] Attachment ${att.guid} failed:`, msg);
          extractedSections.push(`[File: ${att.transferName}] Could not process: ${msg}`);
        }
      }

      const combined = [userText, ...extractedSections].filter(Boolean).join("\n\n");
      const messageForAgent = combined || "(user sent an attachment with no text)";

      const reply = await chat(sender, messageForAgent);

      // Strip any markdown that slipped through
      const cleanReply = reply
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/#{1,6}\s/g, "")
        .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ""));

      console.log(`[${sender}] Replying: ${cleanReply.substring(0, 100)}...`);
      await sdk.messages.sendMessage({ chatGuid, message: cleanReply });
    } catch (err) {
      console.error(`[${sender}] Error processing message:`, err);
      await sdk.messages.sendMessage({
        chatGuid,
        message: "I'm sorry, I encountered an issue processing your message. Please try again.",
      });
    }
  });

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    sdk.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start iMessage integration:", err);
  process.exit(1);
});
