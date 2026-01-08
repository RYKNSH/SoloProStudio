
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

const CHANNELS_TO_FIX = {
    README: "1333757395972915271", // 📕｜はじめに読んでね
    LIVE_ANNOUNCE: "1457033361276014734", // 📢-ライブ告知
    RANKING: "1457033372101771349", // 🏅-ランキング
    SOCIAL: "1457033375658283194", // 🥂-ソーシャルラウンジ
    TICKET: "1457033381098295348" // 🎟️-チケット予約
};

client.once('ready', async () => {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) throw new Error("No guild found");
        console.log(`Inspecting Guild: ${guild.name}`);

        // Fetch and display current topics
        for (const [name, id] of Object.entries(CHANNELS_TO_FIX)) {
            const channel = guild.channels.cache.get(id);
            if (channel && channel.type === ChannelType.GuildText) {
                const textChannel = channel as TextChannel;
                console.log(`[${name}] ${textChannel.name} - Topic: "${textChannel.topic || '(none)'}"`);
            }
        }

        // Check ticket channel message count
        const ticketChannel = guild.channels.cache.get(CHANNELS_TO_FIX.TICKET) as TextChannel;
        if (ticketChannel) {
            const messages = await ticketChannel.messages.fetch({ limit: 50 });
            console.log(`\nTicket Channel has ${messages.size} messages.`);
            messages.forEach(m => {
                console.log(`  - [${m.id}] ${m.author.tag}: ${m.content.substring(0, 50)}... (embeds: ${m.embeds.length}, components: ${m.components.length})`);
            });
        }

        client.destroy();
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
});

client.login(CONFIG.DISCORD.TOKEN);
