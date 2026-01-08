
import {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    TextChannel,
    ChannelType
} from "discord.js";
import "dotenv/config";
import { CONFIG } from "../config.js";

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

const TICKET_CHANNEL_ID = "1457033381098295348"; // 🎟️-チケット予約
const LIVE_ANNOUNCE_ID = "1457033361276014734"; // 📢-ライブ告知

// Keep only the newest panel message
const MESSAGE_TO_KEEP = "1458842788169781314"; // Newest
const MESSAGE_TO_DELETE = "1458773624847863872"; // Older duplicate

client.once('ready', async () => {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) throw new Error("No guild found");
        console.log(`Cleaning up Guild: ${guild.name}`);

        const everyone = guild.roles.everyone;
        const manageRole = guild.roles.cache.find(r => r.name === "運営");
        if (!manageRole) throw new Error("Manage role not found");

        // 1. Delete the duplicate panel message from ticket channel
        const ticketChannel = guild.channels.cache.get(TICKET_CHANNEL_ID) as TextChannel;
        if (ticketChannel) {
            try {
                const msgToDelete = await ticketChannel.messages.fetch(MESSAGE_TO_DELETE);
                if (msgToDelete) {
                    await msgToDelete.delete();
                    console.log("Deleted duplicate panel message.");
                }
            } catch (e) {
                console.log("Could not delete message (may already be gone):", e);
            }

            // 2. Set ticket channel to read-only (no one can send, only button interaction)
            console.log("Setting ticket channel to write-protected...");
            await ticketChannel.edit({
                permissionOverwrites: [
                    { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
                    { id: manageRole.id, allow: [PermissionFlagsBits.SendMessages] }
                ]
            });
        }

        // 3. Restore Live Announce topic if missing
        const liveChannel = guild.channels.cache.get(LIVE_ANNOUNCE_ID) as TextChannel;
        if (liveChannel && !liveChannel.topic) {
            console.log("Restoring Live Announce topic...");
            await liveChannel.setTopic("【ライブ配信】本配信の告知・スケジュールをお知らせします。通知をオンにして見逃し防止！");
        }

        console.log("Cleanup Complete!");
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
});

client.login(CONFIG.DISCORD.TOKEN);
