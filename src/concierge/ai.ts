import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import { getUserContext, saveUserContext } from "../db.js";

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const SYSTEM_PROMPT = `
You are コンシェルジュ サラ (Concierge Sarah), a professional and warm Concierge for the "SoloProStudio" community.
Your role is to assist members who have opened a private support ticket after watching Main Live Broadcasts or Content Archives.
They are here to take specific actions aligned with the video content.

- Speak primarily in Japanese.
- **Keep responses very concise and conversational.** Avoid long paragraphs.
- Guide them smoothly towards their goal (the action they want to take).
- If you don't know something, offer to ping a human admin.
- **Limit your response to approximately 250 Japanese characters.**
`;

export async function generateReply(
    history: { role: "user" | "assistant"; content: string }[],
    userId?: string
): Promise<string> {
    try {
        let currentSystemPrompt = SYSTEM_PROMPT;

        if (userId) {
            const userContext = await getUserContext(userId);
            if (userContext) {
                console.log(`[AI] Injected User Context for ${userId}`);
                currentSystemPrompt += `\n\nUSER CONTEXT (Info about this specific user):\n${userContext}\nUse this context to personalize the conversation, but do not explicitly mention that you are reading from a database file.`;
            }
        }

        console.log("[AI Context]:", JSON.stringify(history, null, 2));

        const message = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 300,
            system: currentSystemPrompt,
            messages: history,
        });

        // Debug Log
        console.log("[AI Raw Response]:", JSON.stringify(message.content, null, 2));

        // Handle different content block types safely

        // Handle different content block types safely
        const textBlock = message.content.find(block => block.type === "text");
        if (textBlock && textBlock.type === "text") {
            return textBlock.text;
        }

        return "申し訳ありません。応答の生成中にエラーが発生しました。";
    } catch (error) {
        console.error("AI Error:", error);
        return "申し訳ありません。現在AIサービスに接続できません。";
    }
}

export async function summarizeAndSave(
    history: { role: "user" | "assistant"; content: string }[],
    userId: string
): Promise<void> {
    try {
        const currentContext = await getUserContext(userId);

        const summaryPrompt = `
You are a helpful assistant.
Read the following conversation history and the current known context about the user.
Update the context with any new important information (preferences, decisions, project details) found in the conversation.
Keep the context concise (max 200 words).
If there is no new information, just return the current context.

Current Context:
${currentContext}

Conversation History:
${history.map(m => `${m.role}: ${m.content}`).join("\n")}

Output ONLY the updated context.
`;

        const message = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 500,
            messages: [{ role: "user", content: summaryPrompt }]
        });

        const textBlock = message.content.find(block => block.type === "text");
        if (textBlock && textBlock.type === "text") {
            const newContext = textBlock.text.trim();
            if (newContext && newContext !== currentContext) {
                await saveUserContext(userId, newContext);
                console.log(`[AI] Updated context for ${userId}`);
            }
        }
    } catch (e) {
        console.error("[AI] Summary Error:", e);
    }
}
