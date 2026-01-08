import Anthropic from "@anthropic-ai/sdk";
import "dotenv/config";
import https from "https";

async function testAnthropic() {
    console.log("Testing Anthropic API...");
    try {
        if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const msg = await anthropic.messages.create({
            model: "claude-3-haiku-20240307",
            max_tokens: 100,
            messages: [{ role: "user", content: "Hello" }]
        });
        console.log("✅ Anthropic Success:", msg.content[0].type === 'text' ? msg.content[0].text : "Non-text response");
    } catch (e: any) {
        console.error("❌ Anthropic Failed:", e.message);
        if (e.status) console.error("Status:", e.status);
    }
}

async function testOpenAI() {
    console.log("\nTesting OpenAI API (via Fetch)...");
    try {
        if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");

        const response = await fetch("https://api.openai.com/v1/models", {
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        console.log("✅ OpenAI Success: Auth checks out");
    } catch (e: any) {
        console.error("❌ OpenAI Failed:", e.message);
    }
}

async function main() {
    await testAnthropic();
    await testOpenAI();
}

main();
