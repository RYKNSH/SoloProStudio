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
import { Transform, PassThrough } from "stream";
import ffmpegPath from "ffmpeg-static";
import { spawn } from "child_process";

// OpenAI Realtime Configuration
const MODEL = "gpt-4o-realtime-preview-2024-12-17";
const URL = `wss://api.openai.com/v1/realtime?model=${MODEL}`;

// Helper: Calculate RMS (Root Mean Square) for volume detection
// Buffer contains 16-bit integers (Little Endian)
function getRMS(buffer: Buffer) {
    let total = 0;
    // Process 2 bytes at a time (16-bit samples)
    for (let i = 0; i < buffer.length; i += 2) {
        if (i + 1 >= buffer.length) break;
        const val = buffer.readInt16LE(i);
        total += val * val;
    }
    const count = buffer.length / 2;
    if (count === 0) return 0;
    return Math.sqrt(total / count);
}

export class RealtimeVoiceSession {
    private ws: WebSocket;
    private connection: VoiceConnection;
    private channel: VoiceChannel;
    private isOpen = false;
    private player: AudioPlayer;
    private speakerStream: Transform | null = null;
    private speakerProcess: any | null = null;
    private activeStreamCount = 0;
    private activeUserStreams = new Set<string>(); // 重複ストリーム防止
    private inactivityTimer: NodeJS.Timeout | null = null; // 無発話タイムアウト
    private static readonly INACTIVITY_TIMEOUT_MS = 60000; // 1分

    constructor(channel: VoiceChannel) {
        console.log(`[SecretVoice] Initializing Session for: ${channel.name} (${channel.id})`);
        this.channel = channel;
        this.player = createAudioPlayer();

        // 1. Connect to OpenAI
        console.log("[SecretVoice] Connecting to OpenAI WebSocket...");
        this.ws = new WebSocket(URL, {
            headers: {
                "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
                "OpenAI-Beta": "realtime=v1",
            },
        });

        // 2. Connect to Discord
        console.log("[SecretVoice] Connecting to Discord Voice Adapter...");
        this.connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator as InternalDiscordGatewayAdapterCreator,
            selfDeaf: false,
            selfMute: false, // Must be unmuted to hear user
        });

        this.connection.subscribe(this.player);

        this.setupOpenAI();
        this.setupDiscord();
        this.setupSpeakerPipeline();
        this.startInactivityTimer(); // 無発話タイマー開始
    }

    private setupSpeakerPipeline() {
        if (!ffmpegPath) {
            console.error("[SecretVoice] FATAL: FFmpeg binary not found!");
            return;
        }
        console.log(`[SecretVoice] Spawning Speaker FFmpeg Process...`);

        // Upsampler: Input 24kHz Mono -> Output 48kHz Stereo
        this.speakerProcess = spawn(ffmpegPath, [
            "-f", "s16le",
            "-ar", "24000",
            "-ac", "1",       // OpenAI sends Mono
            "-i", "pipe:0",   // Input from Node.js Stream
            "-f", "s16le",
            "-ar", "48000",
            "-ac", "2",       // Discord expects Stereo
            "pipe:1"          // Output to Discord AudioPlayer
        ]);

        // PassThroughストリームを作成してFFmpegの出力を流す
        let currentPassThrough = new PassThrough();

        // FFmpegの出力をPassThroughに流す
        this.speakerProcess.stdout.on("data", (chunk: Buffer) => {
            if (!currentPassThrough.destroyed) {
                currentPassThrough.write(chunk);
            }
        });

        // 初回のAudioResourceを作成
        const resource = createAudioResource(currentPassThrough, {
            inputType: StreamType.Raw
        });
        this.player.play(resource);

        // FFmpeg Diagnostics
        this.speakerProcess.stderr.on("data", (d: any) => {
            // Uncomment to debug FFmpeg process internals (noisy!)
            // console.log(`[SecretVoice::SpeakerFFmpeg] ${d.toString()}`);
        });
        this.speakerProcess.on("close", (code: number) => {
            console.log(`[SecretVoice] Speaker FFmpeg Process exited with code ${code}`);
        });

        // Create a Writable Stream to feed data into FFmpeg
        this.speakerStream = new Transform({
            transform(chunk, encoding, callback) {
                this.push(chunk);
                callback();
            }
        });
        this.speakerStream.pipe(this.speakerProcess.stdin);

        this.player.on("stateChange", (oldState, newState) => {
            console.log(`[SecretVoice] AudioPlayer State: ${oldState.status} -> ${newState.status}`);

            // AudioPlayerがidleになったら、新しいPassThroughで再生を再開
            if (newState.status === AudioPlayerStatus.Idle) {
                // 古いPassThroughを閉じて新しいものを作成
                currentPassThrough = new PassThrough();

                const newResource = createAudioResource(currentPassThrough, {
                    inputType: StreamType.Raw
                });
                this.player.play(newResource);
                console.log("[SecretVoice] 🔄 AudioPlayer restarted with new PassThrough");
            }
        });
    }

    private setupOpenAI() {
        this.ws.on("open", () => {
            console.log("[SecretVoice] OpenAI WebSocket OPEN");
            this.isOpen = true;

            const sessionUpdate = {
                type: "session.update",
                session: {
                    modalities: ["text", "audio"],
                    instructions: "You are 'Concierge Sarah' (コンシェルジュ サラ). Speak Japanese clearly and casually. Keep responses brief.",
                    voice: "alloy",
                    input_audio_format: "pcm16",
                    output_audio_format: "pcm16",
                    turn_detection: {
                        type: "server_vad",
                        threshold: 0.5,
                        prefix_padding_ms: 300,
                        silence_duration_ms: 500
                    }
                },
            };
            this.ws.send(JSON.stringify(sessionUpdate));
        });

        this.ws.on("message", (data) => {
            try {
                const event = JSON.parse(data.toString());

                // === COMPREHENSIVE EVENT LOGGING ===
                console.log(`[OpenAI Event] ${event.type}`);

                // Handle specific events
                switch (event.type) {
                    case "session.created":
                        console.log("[SecretVoice] ✅ Session Created Successfully");
                        break;

                    case "session.updated":
                        console.log("[SecretVoice] ✅ Session Updated");
                        break;

                    case "input_audio_buffer.speech_started":
                        console.log("[SecretVoice] 🎤 OpenAI detected speech START");
                        break;

                    case "input_audio_buffer.speech_stopped":
                        console.log("[SecretVoice] 🎤 OpenAI detected speech STOP");
                        // サーバーVADが自動的にレスポンスを生成するので、手動リクエストは不要
                        break;

                    case "response.audio.delta":
                        if (event.delta) {
                            const buffer = Buffer.from(event.delta, "base64");
                            console.log(`[SecretVoice] 🔊 Received ${buffer.length} bytes audio from OpenAI`);
                            this.speakerStream?.write(buffer);
                        }
                        break;

                    case "response.audio.done":
                        console.log("[SecretVoice] 🔊 Audio response complete");
                        break;

                    case "response.done":
                        console.log("[SecretVoice] ✅ Response cycle complete:", JSON.stringify(event, null, 2));
                        break;

                    case "error":
                        console.error("[SecretVoice] ❌ OpenAI Error:", JSON.stringify(event));
                        break;
                }
            } catch (e) {
                console.error("[SecretVoice] JSON Parse Error", e);
            }
        });

        this.ws.on("close", (code, reason) => {
            console.log(`[SecretVoice] OpenAI WebSocket Closed: ${code} ${reason}`);
            this.isOpen = false;
        });

        this.ws.on("error", (err) => {
            console.error("[SecretVoice] WebSocket Error:", err);
        });
    }

    private setupDiscord() {
        this.connection.on(VoiceConnectionStatus.Ready, () => {
            console.log(`[SecretVoice] Discord Connection READY in ${this.channel.name}`);
            this.listenToUser();
        });

        this.connection.on(VoiceConnectionStatus.Disconnected, () => {
            console.log("[SecretVoice] Discord Disconnected");
            this.cleanup();
        });
    }

    private listenToUser() {
        const receiver = this.connection.receiver;

        // Listen to speaking events
        receiver.speaking.on("start", (userId) => {
            // 既にこのユーザーのストリームが処理中なら無視
            if (this.activeUserStreams.has(userId)) {
                return;
            }
            this.activeUserStreams.add(userId);
            this.resetInactivityTimer(); // 発話があったのでタイマーリセット
            console.log(`[SecretVoice] 🎤 User ${userId} started speaking`);

            // Subscribe to raw Opus stream
            const opusStream = receiver.subscribe(userId, {
                end: {
                    behavior: EndBehaviorType.AfterSilence,
                    duration: 500, // 安定した発話終了検出
                },
            });

            // CRITICAL: Handle DAVE decryption errors to prevent crash
            opusStream.on("error", (err) => {
                console.error(`[SecretVoice] OpusStream Error (DAVE?):`, err.message);
                // エラー時もストリームをクリアして次の発話を許可
                this.activeUserStreams.delete(userId);
            });

            // 1. Opus Decoding -> 48kHz PCM (Stereo for compatibility)
            const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });

            // Handle decoder errors
            decoder.on("error", (err) => {
                console.error(`[SecretVoice] Decoder Error:`, err.message);
            });

            opusStream.pipe(decoder);

            // リアルタイムストリーミング: 音声を即座にOpenAIに送信
            decoder.on("data", (pcmChunk: Buffer) => {
                if (!this.isOpen) return;

                try {
                    // Convert 48kHz stereo to 24kHz mono inline
                    const mono24k = this.convertTo24kMono(pcmChunk);
                    if (mono24k.length > 0) {
                        const base64Audio = mono24k.toString("base64");
                        this.ws.send(JSON.stringify({
                            type: "input_audio_buffer.append",
                            audio: base64Audio
                        }));
                    }
                } catch (error) {
                    // 送信エラーは無視（接続切れなど）
                }
            });

            // ストリーム終了時: コミット＆レスポンス要求
            decoder.on("end", () => {
                console.log(`[SecretVoice] 🎤 User ${userId} stopped speaking`);
                this.activeUserStreams.delete(userId);

                if (this.isOpen) {
                    try {
                        // 音声バッファをコミット
                        this.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
                        console.log("[SecretVoice] ✅ Audio buffer committed");

                        // レスポンスを要求
                        this.ws.send(JSON.stringify({ type: "response.create" }));
                        console.log("[SecretVoice] 🚀 Response requested");
                    } catch (error) {
                        console.error("[SecretVoice] Failed to commit/request:", error);
                    }
                }
            });
        });
    }

    // Convert 48kHz stereo PCM to 24kHz mono PCM (inline, no FFmpeg)
    private convertTo24kMono(input: Buffer): Buffer {
        try {
            // Input: 48kHz stereo 16-bit PCM (4 bytes per sample pair)
            // Output: 24kHz mono 16-bit PCM (2 bytes per sample)

            const inputSamples = input.length / 4; // 2 bytes per sample * 2 channels
            const outputSamples = Math.floor(inputSamples / 2); // 48kHz -> 24kHz
            const output = Buffer.allocUnsafe(outputSamples * 2);

            for (let i = 0; i < outputSamples; i++) {
                const inputIndex = i * 2 * 4; // Skip every other sample, 4 bytes per stereo sample

                if (inputIndex + 3 < input.length) {
                    // Read left and right channels
                    const left = input.readInt16LE(inputIndex);
                    const right = input.readInt16LE(inputIndex + 2);

                    // Convert to mono by averaging
                    const mono = Math.floor((left + right) / 2);

                    // Write mono sample
                    output.writeInt16LE(mono, i * 2);
                }
            }

            return output;
        } catch (error) {
            console.error("[SecretVoice] Audio format conversion failed:", error);
            return Buffer.alloc(0);
        }
    }

    public stop() {
        this.cleanup();
    }

    // 無発話タイマー開始
    private startInactivityTimer() {
        this.inactivityTimer = setTimeout(async () => {
            console.log(`[SecretVoice] ⏰ 1分間発話がないためチャンネルを削除します: ${this.channel.name}`);
            await this.deleteChannelAndCleanup();
        }, RealtimeVoiceSession.INACTIVITY_TIMEOUT_MS);
    }

    // 発話があった場合にタイマーをリセット
    private resetInactivityTimer() {
        if (this.inactivityTimer) {
            clearTimeout(this.inactivityTimer);
        }
        this.startInactivityTimer();
    }

    // チャンネル削除とクリーンアップ
    private async deleteChannelAndCleanup() {
        try {
            this.cleanup();
            await this.channel.delete();
            console.log(`[SecretVoice] 🗑️ チャンネル削除完了: ${this.channel.name}`);
        } catch (e) {
            console.error("[SecretVoice] チャンネル削除エラー:", e);
        }
    }

    private cleanup() {
        try {
            if (this.inactivityTimer) {
                clearTimeout(this.inactivityTimer);
                this.inactivityTimer = null;
            }
            this.ws.close();
            this.speakerProcess?.kill();
            this.connection.destroy();
        } catch (e) {
            console.error("[SecretVoice] Error during cleanup", e);
        }
    }
}

export async function createSecretVoiceChannel(interaction: ButtonInteraction, client: Client) {
    if (!interaction.guild) return;

    // 1. Immediately defer the reply to prevent timeout
    // If this fails, we should NOT proceed (avoids orphan channels)
    let deferSuccess = false;
    try {
        if (!interaction.deferred && !interaction.replied) {
            await interaction.deferReply({ ephemeral: true });
            deferSuccess = true;
        } else {
            deferSuccess = true; // Already deferred/replied
        }
    } catch (e) {
        console.warn("[VoiceHandler] Defer failed - aborting to prevent orphan channel", e);
        // Cannot communicate with user anyway, so just return
        return;
    }

    if (!deferSuccess) {
        console.warn("[VoiceHandler] Defer did not succeed - aborting");
        return;
    }

    const user = interaction.user;
    const channelName = `🔒 秘密通話 - ${user.displayName || user.username}`;

    // Category Logic (simplified)
    let parentCategoryId: string | undefined;
    const currentChannel = interaction.channel;
    if (currentChannel) {
        if (currentChannel.isThread() && currentChannel.parent?.parentId) {
            parentCategoryId = currentChannel.parent.parentId;
        } else if ('parentId' in currentChannel && currentChannel.parentId) {
            parentCategoryId = currentChannel.parentId as string;
        }
    }
    if (!parentCategoryId) {
        parentCategoryId = interaction.guild.channels.cache.find(
            c => c.type === ChannelType.GuildCategory && c.name.includes("WEBINAR")
        )?.id;
    }

    try {
        console.log(`[VoiceHandler] Creating channel: ${channelName}`);
        const voiceChannel = await interaction.guild.channels.create({
            name: channelName,
            type: ChannelType.GuildVoice,
            parent: parentCategoryId,
            permissionOverwrites: [
                { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] },
                { id: client.user!.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak] }
            ],
        });

        console.log(`[VoiceHandler] Starting Session in ${voiceChannel.name} (${voiceChannel.id})`);
        new RealtimeVoiceSession(voiceChannel);

        const content = `✅ **ボイスチャット準備完了**\n<#${voiceChannel.id}> に参加してください！`;
        await interaction.editReply({ content });

    } catch (e: any) {
        console.error("Secret Voice Creation Error", e);
        try {
            await interaction.editReply({ content: "❌ 作成に失敗しました。もう一度お試しください。" });
        } catch (_) { }
    }
}


// Track empty channel timers
const emptyChannelTimers = new Map<string, NodeJS.Timeout>();

export function setupSecretVoiceHandler(client: Client) {
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isButton()) return;
        if (interaction.customId === "start_voice") {
            await createSecretVoiceChannel(interaction, client);
        }
    });

    // Auto-delete empty secret voice channels after 1 minute
    client.on("voiceStateUpdate", async (oldState, newState) => {
        // Check if someone left a channel
        const leftChannel = oldState.channel;
        if (!leftChannel) return;
        if (leftChannel.type !== ChannelType.GuildVoice) return;
        if (!leftChannel.name.startsWith("🔒 秘密通話")) return;

        // Get member count (exclude bots)
        const humanMembers = leftChannel.members.filter(m => !m.user.bot);

        if (humanMembers.size === 0) {
            // Channel is now empty of humans, start 1 minute timer
            console.log(`[SecretVoice] Channel ${leftChannel.name} is empty, starting 1 minute timer...`);

            // Clear existing timer if any
            const existingTimer = emptyChannelTimers.get(leftChannel.id);
            if (existingTimer) clearTimeout(existingTimer);

            const timer = setTimeout(async () => {
                try {
                    // Re-fetch channel to check if still empty
                    const channel = await client.channels.fetch(leftChannel.id).catch(() => null);
                    if (channel && channel.type === ChannelType.GuildVoice) {
                        const currentMembers = (channel as VoiceChannel).members.filter(m => !m.user.bot);
                        if (currentMembers.size === 0) {
                            console.log(`[SecretVoice] Deleting empty channel: ${channel.name}`);
                            await channel.delete();
                        }
                    }
                } catch (e) {
                    console.error("[SecretVoice] Failed to delete empty channel:", e);
                }
                emptyChannelTimers.delete(leftChannel.id);
            }, 60000); // 1 minute

            emptyChannelTimers.set(leftChannel.id, timer);
        } else {
            // Someone is still in the channel, cancel timer if exists
            const existingTimer = emptyChannelTimers.get(leftChannel.id);
            if (existingTimer) {
                console.log(`[SecretVoice] Human rejoined, canceling delete timer for ${leftChannel.name}`);
                clearTimeout(existingTimer);
                emptyChannelTimers.delete(leftChannel.id);
            }
        }
    });
}
