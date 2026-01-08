
import { Client, GatewayIntentBits, ChannelType } from "discord.js";
import "dotenv/config";
import { CONFIG } from "../config.js";

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
    const guild = client.guilds.cache.first();
    if (!guild) {
        console.error("No guild found");
        process.exit(1);
    }

    console.log(`Current Guild: ${guild.name} (${guild.id})`);
    console.log("--- Channels ---");

    // Fetch all channels
    await guild.channels.fetch();

    // Group by category
    const categories = guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory);
    const orphans = guild.channels.cache.filter(c => c.parentId === null && c.type !== ChannelType.GuildCategory);

    const printChannel = (c: any) => {
        console.log(`    - [${c.type}] ${c.name} (ID: ${c.id})`);
    };

    console.log("[Orphans]");
    orphans.forEach(printChannel);

    categories.forEach(cat => {
        console.log(`[Category] ${cat.name} (ID: ${cat.id})`);
        const children = guild.channels.cache.filter(c => c.parentId === cat.id);
        children.forEach(printChannel);
    });

    client.destroy();
});

client.login(CONFIG.DISCORD.TOKEN);
