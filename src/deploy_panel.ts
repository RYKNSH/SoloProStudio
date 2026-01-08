import { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } from "discord.js";
import "dotenv/config";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on("ready", async () => {
    console.log("Deployer Ready");
    const guild = client.guilds.cache.first();
    if (!guild) return;

    // Find the Ticket Reservation channel by fuzzy name match
    const channel = guild.channels.cache.find(c => c.name.includes("チケット予約"));

    if (channel?.isTextBased()) {
        const embed = new EmbedBuilder()
            .setTitle("🎫 Concierge Desk")
            .setDescription("個別サポートが必要な方は、下のボタンを押してチケットを作成してください。\nプライベートな部屋を作成し、AIコンシェルジュがお迎えします。")
            .setColor(0x00FF00); // Green

        const button = new ButtonBuilder()
            .setCustomId("create_ticket")
            .setLabel("📩 サポートを受ける") // Already Japanese, ensuring match
            .setStyle(ButtonStyle.Primary)
            .setEmoji("📩");

        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

        await channel.send({ embeds: [embed], components: [row] });
        console.log("Panel Deployed!");
    } else {
        console.error("Channel not found or not text-based");
    }

    client.destroy();
});

client.login(process.env.DISCORD_TOKEN);
