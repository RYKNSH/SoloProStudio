import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client, GatewayIntentBits, ChannelType, TextChannel, Guild } from "discord.js";
import { z } from "zod";
import "dotenv/config";
import { setupTicketHandlers } from "./concierge/tickets.js";
import { setupSecretVoiceHandler } from "./concierge/secret_voice_chat.js";
import { getUserContext, saveUserContext } from "./db.js";

import { CONFIG } from "./config.js";

const DISCORD_TOKEN = CONFIG.DISCORD.TOKEN;

// Initialize Discord Client
export const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

// Helper to get the first guild
async function getGuild(): Promise<Guild> {
  const guild = discordClient.guilds.cache.first();
  if (!guild) {
    throw new Error("Bot is not in any guild");
  }
  return guild;
}

export function installDiscordTools(server: McpServer) {
  server.tool(
    "list_channels",
    "List all channels in the server",
    {},
    async () => {
      const guild = await getGuild();
      const channels = await guild.channels.fetch();
      const channelList = channels.map((c) => {
        if (!c) return "Unknown Channel";
        return `${c.name} (ID: ${c.id}, Type: ${ChannelType[c.type]})`
      }).join("\n");
      return {
        content: [{ type: "text", text: `Channels:\n${channelList}` }],
      };
    }
  );

  server.tool(
    "create_channel",
    "Create a new text or voice channel",
    {
      name: z.string(),
      type: z.enum(["text", "voice"]).default("text"),
    },
    async ({ name, type }) => {
      const guild = await getGuild();
      const channelType = type === "voice" ? ChannelType.GuildVoice : ChannelType.GuildText;
      const channel = await guild.channels.create({
        name,
        type: channelType,
      });
      return {
        content: [{ type: "text", text: `Created channel: ${channel.name} (ID: ${channel.id})` }],
      };
    }
  );

  server.tool(
    "delete_channel",
    "Delete a channel by ID",
    {
      channel_id: z.string(),
    },
    async ({ channel_id }) => {
      const guild = await getGuild();
      const channel = await guild.channels.fetch(channel_id);
      if (!channel) throw new Error("Channel not found");
      await channel.delete();
      return {
        content: [{ type: "text", text: `Deleted channel: ${channel.name}` }],
      };
    }
  );

  server.tool(
    "create_role",
    "Create a new role",
    {
      name: z.string(),
      color: z.string().optional(),
      hoist: z.boolean().default(false),
    },
    async ({ name, color, hoist }) => {
      const guild = await getGuild();
      const role = await guild.roles.create({
        name,
        color: color as any,
        hoist,
        reason: "Created via MCP",
      });
      return {
        content: [{ type: "text", text: `Created role: ${role.name} (ID: ${role.id})` }],
      };
    }
  );

  server.tool(
    "get_user_context",
    "Get stored context for a user from Supabase",
    {
      user_id: z.string(),
    },
    async ({ user_id }) => {
      const context = await getUserContext(user_id);
      return {
        content: [{ type: "text", text: context || "No context found." }]
      };
    }
  );

  server.tool(
    "save_user_context",
    "Save or update user context in Supabase",
    {
      user_id: z.string(),
      context: z.string(),
    },
    async ({ user_id, context }) => {
      const success = await saveUserContext(user_id, context);
      if (!success) throw new Error("Failed to save context");
      return {
        content: [{ type: "text", text: "Context saved successfully." }]
      };
    }
  );

  server.tool(
    "read_messages",
    "Read recent messages from a channel",
    {
      channel_id: z.string(),
      limit: z.number().default(10),
    },
    async ({ channel_id, limit }) => {
      const guild = await getGuild();
      const channel = await guild.channels.fetch(channel_id);
      if (!channel || !channel.isTextBased()) {
        throw new Error("Channel not found or not text-based");
      }
      const messages = await channel.messages.fetch({ limit });
      const messageList = messages.map(m =>
        `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}`
      ).reverse().join("\n");

      return {
        content: [{ type: "text", text: `Messages in ${channel.name}:\n${messageList}` }]
      };
    }
  );

  server.tool(
    "update_channel",
    "Update channel details",
    {
      channel_id: z.string(),
      name: z.string().optional(),
      topic: z.string().optional(),
    },
    async ({ channel_id, name, topic }) => {
      const guild = await getGuild();
      const channel = await guild.channels.fetch(channel_id);
      if (!channel) throw new Error("Channel not found");
      const updated = await channel.edit({ name, topic });
      return {
        content: [{ type: "text", text: `Updated channel: ${updated.name}` }]
      };
    }
  );
}

// Start Main Logic (Shared)
export async function startDiscordClient() {
  if (!DISCORD_TOKEN) throw new Error("Missing DISCORD_TOKEN");

  // Check if already ready to avoid re-login issues in HMR/Serverless
  if (discordClient.isReady()) return;

  setupTicketHandlers(discordClient);
  setupSecretVoiceHandler(discordClient);
  await discordClient.login(DISCORD_TOKEN);

  discordClient.once("ready", async () => {
    console.log(`Logged in as ${discordClient.user?.tag}`);
  });
}

// CLI Execution Support
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new McpServer({
    name: "discord-driver",
    version: "1.0.0"
  });

  installDiscordTools(server);

  startDiscordClient().then(async () => {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server connected to stdio");
  }).catch(console.error);
}
