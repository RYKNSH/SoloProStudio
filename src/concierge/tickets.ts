import {
    Client,
    ButtonInteraction,
    ChannelType,
    PermissionFlagsBits,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
    TextChannel,
    Interaction
} from "discord.js";
import { generateReply, summarizeAndSave } from "./ai.js";
import { createSecretVoiceChannel } from "./secret_voice_chat.js";

export function setupTicketHandlers(client: Client) {
    client.on("interactionCreate", async (interaction: Interaction) => {
        if (!interaction.isButton()) return;

        try {
            if (interaction.customId === "create_ticket") {
                await handleCreateTicket(interaction, client);
            } else if (interaction.customId === "close_ticket") {
                await handleCloseTicket(interaction);
            } else if (interaction.customId === "start_voice") {
                // Now handled by secret_voice_chat.ts listener, but we can keep it here OR remove it.
                // Best to keep tickets logic together if possible, or delegate.
                // Since we added a global listener in secret_voice_chat.ts, this might duplicate?
                // No, secret_voice_chat.ts has its own listener.
                // Standard practice: Have one central router or separate listeners.
                // I will Comment out here to avoid double-handling if separate listener is active.
                await createSecretVoiceChannel(interaction, client);
            }
        } catch (error) {
            console.error("Interaction Error:", error);
            try {
                if (!interaction.replied) await interaction.reply({ content: "エラーが発生しました。", ephemeral: true });
            } catch (e) { }
        }
    });

    client.on("messageCreate", async (message) => {
        if (message.author.bot) return;

        const channel = message.channel;
        if (!channel.isThread()) return;
        if (!channel.name.startsWith("ticket-")) return;

        console.log(`Processing Ticket Message: ${message.content}`);
        await channel.sendTyping();

        const messages = await channel.messages.fetch({ limit: 10 });
        const history = Array.from(messages.values())
            .reverse()
            .map(m => ({
                role: m.author.bot ? "assistant" as const : "user" as const,
                content: m.content
            }))
            .filter(m => m.content.trim() !== "");

        const reply = await generateReply(history, message.author.id);

        // Webhook sending logic
        try {
            const webhooks = await channel.parent?.fetchWebhooks() || await (channel as any).parent?.fetchWebhooks();
            let webhook = webhooks?.find(w => w.name === "コンシェルジュ サラ");

            if (!webhook && channel.parent) {
                webhook = await channel.parent.createWebhook({
                    name: "コンシェルジュ サラ",
                    avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712009.png"
                });
            }

            if (webhook) {
                await webhook.send({
                    content: reply,
                    threadId: channel.id,
                    username: "コンシェルジュ サラ",
                    avatarURL: "https://cdn-icons-png.flaticon.com/512/4712/4712009.png"
                });
            } else {
                await channel.send(reply);
            }
        } catch (e) {
            console.error("Webhook Error", e);
            await channel.send(reply);
        }
    });
}

async function handleCreateTicket(interaction: ButtonInteraction, client: Client) {
    const channel = interaction.channel;
    if (!channel || channel.type !== ChannelType.GuildText) {
        await interaction.reply({ content: "このチャンネルではチケットを作成できません。", ephemeral: true });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    const user = interaction.user;
    const threadName = `ticket-${user.username}`;

    const ticketThread = await channel.threads.create({
        name: threadName,
        type: ChannelType.PrivateThread,
        autoArchiveDuration: 60,
        reason: `Ticket for ${user.username}`
    });

    await ticketThread.members.add(user.id);

    const closeButton = new ButtonBuilder()
        .setCustomId("close_ticket")
        .setLabel("🔒 チケットを終了")
        .setStyle(ButtonStyle.Danger);

    const voiceButton = new ButtonBuilder()
        .setCustomId("start_voice")
        .setLabel("📞 音声通話を開始")
        .setStyle(ButtonStyle.Success);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(voiceButton, closeButton);

    await interaction.editReply({
        content: `プライベートスレッドを作成しました: <#${ticketThread.id}>`
    });

    setTimeout(async () => {
        try {
            const parent = ticketThread.parent as TextChannel;
            if (parent) {
                const webhooks = await parent.fetchWebhooks();
                let webhook = webhooks.find(w => w.name === "コンシェルジュ サラ");
                if (!webhook) {
                    webhook = await parent.createWebhook({
                        name: "コンシェルジュ サラ",
                        avatar: "https://cdn-icons-png.flaticon.com/512/4712/4712009.png"
                    });
                }

                await webhook.send({
                    content: `ようこそ <@${user.id}> さん！\nコンシェルジュのサラです。\nご用件をお伺いします。右下のボタンで音声通話も可能です。`,
                    components: [row],
                    threadId: ticketThread.id,
                    username: "コンシェルジュ サラ",
                    avatarURL: "https://cdn-icons-png.flaticon.com/512/4712/4712009.png"
                });
            }
        } catch (e) { console.error("Greeting Error", e); }
    }, 1000);
}

async function handleCloseTicket(interaction: ButtonInteraction) {
    const channel = interaction.channel;
    if (channel && channel.isThread()) {
        await interaction.reply("チケットを終了します...");

        try {
            const starterId = (await channel.fetchStarterMessage())?.author.id; // Simplified
            const messages = await channel.messages.fetch({ limit: 50 });
            // Logic for summary...
            if (starterId) {
                // Call summarize (imported)
                const history = Array.from(messages.values()).reverse().map(m => ({ role: m.author.bot ? "assistant" as const : "user" as const, content: m.content }));
                await summarizeAndSave(history, starterId);
            }
        } catch (e) {
            console.error("Summary Failed:", e);
        }

        setTimeout(async () => {
            await channel.setLocked(true);
            await channel.setArchived(true);
        }, 1000);
    } else {
        await interaction.reply({ content: "スレッド以外では実行できません。", ephemeral: true });
    }
}
