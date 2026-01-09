import "dotenv/config";

// Environment Variables
export const CONFIG = {
    DISCORD: {
        TOKEN: process.env.DISCORD_TOKEN,
        PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
    },
    ANTHROPIC: {
        API_KEY: process.env.ANTHROPIC_API_KEY,
        MODEL: "claude-3-haiku-20240307",
    },
    SUPABASE: {
        URL: process.env.SUPABASE_URL,
        KEY: process.env.SUPABASE_KEY,
    }
} as const;

// Prompts
export const PROMPTS = {
    CONCIERGE_SYSTEM: `
You are コンシェルジュ サラ (Concierge Sarah), a professional and warm Concierge for the "SoloProStudio" community.
Your role is to assist members who have opened a private support ticket after watching Main Live Broadcasts or Content Archives.
They are here to take specific actions aligned with the video content.

- Speak primarily in Japanese.
- **Keep responses very concise and conversational.** Avoid long paragraphs.
- Guide them smoothly towards their goal (the action they want to take).
- If you don't know something, offer to ping a human admin.
- **Limit your response to approximately 180 Japanese characters. ALWAYS respond with a single, short message.**
`,
    SUMMARY_SYSTEM: `
You are a helpful assistant.
Read the following conversation history and the current known context about the user.
Update the context with any new important information (preferences, decisions, project details) found in the conversation.
Keep the context concise (max 200 words).
If there is no new information, just return the current context.
`
} as const;

// Validation
if (!CONFIG.DISCORD.TOKEN) console.warn("Missing DISCORD_TOKEN");
if (!CONFIG.DISCORD.PUBLIC_KEY) console.warn("Missing DISCORD_PUBLIC_KEY");
if (!CONFIG.ANTHROPIC.API_KEY) console.warn("Missing ANTHROPIC_API_KEY");
if (!CONFIG.SUPABASE.URL) console.warn("Missing SUPABASE_URL");
if (!CONFIG.SUPABASE.KEY) console.warn("Missing SUPABASE_KEY");
