import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import { CONFIG, PROMPTS } from "../config.js";
import { getUserContext, saveUserContext } from "../db.js";

const anthropic = new Anthropic({
    apiKey: CONFIG.ANTHROPIC.API_KEY,
});

const SYSTEM_PROMPT = PROMPTS.CONCIERGE_SYSTEM;

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
            model: CONFIG.ANTHROPIC.MODEL,
            max_tokens: 180,
            system: currentSystemPrompt,
            messages: history,
        });

        // Debug Log
        console.log("[AI Raw Response]:", JSON.stringify(message.content, null, 2));


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

        const summaryPrompt = `${PROMPTS.SUMMARY_SYSTEM}

Current Context:
${currentContext}

Conversation History:
${history.map(m => `${m.role}: ${m.content}`).join("\n")}

Output ONLY the updated context.
`;

        const message = await anthropic.messages.create({
            model: CONFIG.ANTHROPIC.MODEL,
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
