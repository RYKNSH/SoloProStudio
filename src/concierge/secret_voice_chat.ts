import {
    joinVoiceChannel,
    EndBehaviorType,
    VoiceConnection,
    VoiceConnectionStatus,
    createAudioPlayer,
    AudioPlayerStatus,
    createAudioResource,
    StreamType,
    AudioPlayer
} from "@discordjs/voice";
import { WebSocket } from "ws";
import { VoiceChannel, InternalDiscordGatewayAdapterCreator, ButtonInteraction, Client, ChannelType, PermissionFlagsBits } from "discord.js";
import prism from "prism-media";
import "dotenv/config";
import { Readable, Transform } from "stream";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";

// OpenAI Realtime Configuration
const MODEL = "gpt-4o-realtime-preview-2024-10-01";
const URL = `wss://api.openai.com/v1/realtime?model=${MODEL}`;

export class RealtimeVoiceSession {
    private ws: WebSocket;
    private connection: VoiceConnection;
    private channel: VoiceChannel;
    private isOpen = false;
    private player: AudioPlayer;
    private speakerStream: Transform | null = null; // Stream feeding the FFmpeg process (Speaker)
    private speakerProcess: any | null = null;      // FFmpeg Process (24k -> 48k)

    constructor(channel: VoiceChannel) {
        this.channel = channel;
        this.player = createAudioPlayer();

        // 1. Connect to OpenAI
        this.ws = new WebSocket(URL, {
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1",
            },
        });

        // 2. Connect to Discord
        this.connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator as InternalDiscordGatewayAdapterCreator,
            selfDeaf: false,
            selfMute: false,
        });

        this.connection.subscribe(this.player);

        this.setupOpenAI();
        this.setupDiscord();
        this.setupSpeakerPipeline();

        console.log(`[SecretVoice] Session initialized for ${channel.name}`);
        if (!process.env.OPENAI_API_KEY) console.warn("[SecretVoice] WARNING: OPENAI_API_KEY is missing or empty.");
    }

    private setupSpeakerPipeline() {
        if (!ffmpegPath) {
            console.error("[SecretVoice] FFmpeg not found!");
            return;
        }
        console.log(`[SecretVoice] Spawning Speaker FFmpeg: ${ffmpegPath}`);

        // Upsampler: 24k PCM (S16LE) -> 48k PCM (S16LE)
        this.speakerProcess = spawn(ffmpegPath, [
            "-f", "s16le",
            "-ar", "24000",
            "-ac", "1", // OpenAI is mono
            "-i", "pipe:0",
            "-f", "s16le",
            "-ar", "48000",
            "-ac", "2", // Discord prefers stereo? Or mono is fine. Let's try stereo to be safe.
            "pipe:1"
        ]);

        // Capture FFmpeg Output and play it
        const resource = createAudioResource(this.speakerProcess.stdout, {
            inputType: StreamType.Raw
        });

        this.player.play(resource);

        this.speakerProcess.stderr.on("data", (d: any) => {
            // console.log(`[FFmpeg Speaker Output] ${d.toString()}`); // Uncomment for deep debug
        });
        this.speakerProcess.on("error", (e: any) => console.error("[SecretVoice] Speaker FFmpeg Error:", e));
        this.speakerProcess.on("exit", (code: number) => console.log(`[SecretVoice] Speaker FFmpeg exited with code ${code}`));

        // This stream accepts 24k PCM buffers from OpenAI
        this.speakerStream = new Transform({
            transform(chunk, encoding, callback) {
                this.push(chunk);
                callback();
            }
        });

        this.speakerStream.pipe(this.speakerProcess.stdin);
    }

    private setupOpenAI() {
        this.ws.on("open", () => {
            console.log("Connected to OpenAI Realtime API");
            this.isOpen = true;

            // Initial Session Updating
            const sessionUpdate = {
                type: "session.update",
                session: {
                    modalities: ["text", "audio"],
                    instructions: "You are Concierge Sarah (コンシェルジュ サラ). Speak Japanese casually. Keep responses short.",
                    voice: "alloy",
                    input_audio_format: "pcm16",
                    output_audio_format: "pcm16",
                },
            };
            this.ws.send(JSON.stringify(sessionUpdate));
        });

        this.ws.on("message", (data) => {
            try {
                const event = JSON.parse(data.toString());
                // console.log(`[SecretVoice] WS Event: ${event.type}`); // Check event flow
                if (event.type === "response.audio.delta" && event.delta) {
                    process.stdout.write("."); // Visual heartbeat for audio
                    // OpenAI sends Base64 PCM16 24kHz
                    const buffer = Buffer.from(event.delta, "base64");
                    this.speakerStream?.write(buffer);
                } else if (event.type === "response.create") {
                    console.log("[SecretVoice] OpenAI Response Created");
                } else if (event.type === "error") {
                    console.error("[SecretVoice] OpenAI Error Event:", JSON.stringify(event));
                }
            } catch (e) {
                console.error("Error parsing WS message", e);
            }
        });

        this.ws.on("close", (code, reason) => console.log(`[SecretVoice] OpenAI WS Closed: ${code} ${reason}`));
        this.ws.on("error", (error) => console.error("[SecretVoice] OpenAI WS Error:", error));
    }

    private setupDiscord() {
        this.connection.on(VoiceConnectionStatus.Ready, () => {
            console.log(`Joined Secret Voice Channel: ${this.channel.name}`);
            this.listenToUser();
        });

        this.connection.on(VoiceConnectionStatus.Disconnected, () => {
            this.stop();
        });
    }

    private listenToUser() {
        const receiver = this.connection.receiver;

        if (!ffmpegPath) return;

        receiver.speaking.on("start", (userId) => {
            console.log(`User ${userId} started speaking`);
            const opusStream = receiver.subscribe(userId, {
                end: {
                    behavior: EndBehaviorType.AfterSilence,
                    duration: 500,
                },
            });

            // 1. Opus -> PCM 48k
            const decoder = new prism.opus.Decoder({ rate: 48000, channels: 1, frameSize: 960 });
            const inputPCM = opusStream.pipe(decoder);

            // 2. PCM 48k -> PCM 24k (FFmpeg)
            const downsampler = spawn(ffmpegPath, [
                "-f", "s16le",
                "-ar", "48000",
                "-ac", "1",
                "-i", "pipe:0",
                "-f", "s16le",
                "-ar", "24000",
                "-ac", "1",
                "pipe:1"
            ]);

            inputPCM.pipe(downsampler.stdin);

            // 3. Send to OpenAI
            downsampler.stdout.on("data", (chunk: Buffer) => {
                // console.log(`[SecretVoice] Microphone Chunk: ${chunk.length}`); // Too verbose?
                if (this.isOpen) {
                    const base64 = chunk.toString("base64");
                    this.ws.send(JSON.stringify({
                        type: "input_audio_buffer.append",
                        audio: base64
                    }));
                } else {
                    console.warn("[SecretVoice] WS not open, dropping audio");
                }
            });

            downsampler.stdout.on("end", () => {
                console.log(`[SecretVoice] User ${userId} stopped speaking (stream ended)`);
                if (this.isOpen) {
                    this.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
                    this.ws.send(JSON.stringify({ type: "response.create" }));
                }
            });

            downsampler.stderr.on("data", (d: any) => {
                // console.log(`[FFmpeg Input Error]: ${d.toString()}`); 
            });
            downsampler.on("error", (e) => console.error("[SecretVoice] Microphone Downsampler Error:", e));
            downsampler.on("close", (code) => console.log(`[SecretVoice] Microphone Downsampler closed code=${code}`));
        });

    }

    public stop() {
        this.connection.destroy();
        this.ws.close();
        this.speakerProcess?.kill();
        this.speakerProcess = null;
    }
}

/**
 * Handles the creation of a secret voice channel and initiates the voice session.
 */
export async function createSecretVoiceChannel(interaction: ButtonInteraction, client: Client) {
    if (!interaction.guild) return;
    await interaction.deferReply({ ephemeral: true });

    const user = interaction.user;
    const channelName = `secret-voice-${user.username}`;

    // Find Category: Use the Parent of the current channel (if it's a thread, parent is the Text Channel)
    // If interaction is from a button in a Thread, interaction.channel is the Thread.
    // Parent of Thread is the TextChannel. Parent of TextChannel is the Category.

    let parentCategory: string | null | undefined = interaction.guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name.includes("WEBINAR"))?.id;

    if (interaction.channel?.isThread()) {
        const textChannel = interaction.channel.parent;
        // Priority 1: Same category as the Text Channel where the thread lives
        if (textChannel && textChannel.parentId) {
            parentCategory = textChannel.parentId;
        }
    } else if (interaction.channel?.parentId) {
        parentCategory = interaction.channel.parentId;
    }

    try {
        const voiceChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: parentCategory,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
                },
                {
                    id: client.user!.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
                }
            ],
        });

        // Initialize Session
        new RealtimeVoiceSession(voiceChannel);

        await interaction.editReply({
            content: `シークレットボイスチャットを作成しました: <#${voiceChannel.id}>\nこちらに参加して、サラと会話してください。`
        });
    } catch (e) {
        console.error("Secret Voice Creation Error", e);
        try {
            await interaction.editReply("シークレットボイスチャットの作成に失敗しました。");
        } catch (e2) { }
    }
}

/**
 * Registers the interaction listener for secret voice chat.
 * This MUST be called by the persistent Driver (Discord Client).
 */
export function setupSecretVoiceHandler(client: Client) {
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        if (interaction.customId === "start_voice") {
            console.log("[VoiceHandler] 'start_voice' clicked. Creating channel...");
            await createSecretVoiceChannel(interaction, client);
        }
    });
}
