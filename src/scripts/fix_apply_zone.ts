
import {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits
} from "discord.js";
import "dotenv/config";
import { CONFIG } from "../config.js";

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const TICKET_CHANNEL_ID = "1457033381098295348"; // 🎟️-チケット予約
const APPLY_ZONE_CATEGORY_ID = "1457033395216322641"; // 🤝 APPLY ZONE

client.once('ready', async () => {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) throw new Error("No guild found");
        console.log(`Fixing Guild: ${guild.name}`);

        // Get roles
        const everyone = guild.roles.everyone;
        const manageRole = guild.roles.cache.find(r => r.name === "運営");
        const applyRole = guild.roles.cache.find(r => r.name === "アプライ");

        if (!manageRole || !applyRole) {
            throw new Error("Required roles not found");
        }

        // 1. Move Ticket Channel back to APPLY ZONE
        const ticketChannel = guild.channels.cache.get(TICKET_CHANNEL_ID);
        if (ticketChannel) {
            console.log("Moving Ticket Channel back to APPLY ZONE...");
            await ticketChannel.setParent(APPLY_ZONE_CATEGORY_ID);
        }

        // 2. Update APPLY ZONE category to be visible ONLY to Apply role + Manage
        const applyCategory = guild.channels.cache.get(APPLY_ZONE_CATEGORY_ID);
        if (applyCategory) {
            console.log("Updating APPLY ZONE permissions...");
            await applyCategory.edit({
                permissionOverwrites: [
                    { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: applyRole.id, allow: [PermissionFlagsBits.ViewChannel] },
                    { id: manageRole.id, allow: [PermissionFlagsBits.ViewChannel] }
                ]
            });
        }

        console.log("Fix Complete!");
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
});

client.login(CONFIG.DISCORD.TOKEN);
