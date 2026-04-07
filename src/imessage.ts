import { SDK } from "@photon-ai/advanced-imessage-kit";
import { chat } from "./agents/preDiagnosisAgent.js";
import { closeDb } from "./database.js";
import "dotenv/config";

async function main() {
  const sdk = SDK({
    serverUrl: process.env.PHOTON_SERVER_URL,
    apiKey: process.env.PHOTON_API_KEY,
  });

  await sdk.connect();

  sdk.on("ready", () => {
    console.log("Healthcare agent is now listening for iMessages...");
  });

  sdk.on("new-message", async (message) => {
    if (message.isFromMe) return;

    const userText = message.text?.trim();
    if (!userText) return;

    const sender = message.handle?.address;
    if (!sender) return;

    console.log(`[${sender}] Received: ${userText}`);

    try {
      const reply = await chat(sender, userText);

      // Strip any markdown that slipped through
      const cleanReply = reply
        .replace(/\*\*(.*?)\*\*/g, "$1")
        .replace(/\*(.*?)\*/g, "$1")
        .replace(/#{1,6}\s/g, "")
        .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, ""));

      console.log(`[${sender}] Replying: ${cleanReply.substring(0, 100)}...`);
      await sdk.messages.sendMessage({ chatGuid: message.chats?.[0]?.guid || `iMessage;-;${sender}`, message: cleanReply });
    } catch (err) {
      console.error(`[${sender}] Error processing message:`, err);
      const chatGuid = message.chats?.[0]?.guid || `iMessage;-;${sender}`;
      await sdk.messages.sendMessage({ chatGuid, message: "I'm sorry, I encountered an issue processing your message. Please try again." });
    }
  });

  process.on("SIGINT", async () => {
    console.log("\nShutting down...");
    closeDb();
    sdk.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Failed to start iMessage integration:", err);
  process.exit(1);
});
