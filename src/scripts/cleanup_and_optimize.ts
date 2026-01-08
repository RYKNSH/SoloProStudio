
import {
    Client,
    GatewayIntentBits,
    PermissionFlagsBits,
    Guild,
    Role,
    ChannelType
} from "discord.js";
import "dotenv/config";
import { CONFIG } from "../config.js";

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// IDs of duplicates to DELETE
const DELETE_IDS = [
    "1458840605324218411", // ONBOARDING
    "1458840607110856816", // 初めに読んでね
    "1458840608683724998", // パブリックゾーン
    "1458840609853931522", // ライブ告知
    "1458840612039033006", // アーカイブ
    "1458840613721210973", // 海外最新情報
    "1458840615000477843", // ランキング
    "1458840618037153988", // ソーシャルラウンジ
    "1458840619681190077", // クエスト
    "1458840621736530015", // チケット予約
    "1458840623376240845", // ウェビナーゾーン
    "1458840625586769972", // 依存
    "1458840626798919797", // アーティストリーゾーン
    "1458840628593954973"  // ギャラリー
];

// IDs of ORIGINAL channels to UPDATE
const TARGETS = {
    CHANNELS: {
        README: "1333757395972915271", // 📕｜はじめに読んでね
        LIVE_ANNOUNCE: "1457033361276014734", // 📢-ライブ告知
        RANKING: "1457033372101771349", // 🏅-ランキング
        SOCIAL: "1457033375658283194", // 🥂-ソーシャルラウンジ
        ARCHIVE: "1458287517093724181", // 📹-アーカイブ
        NEWS: "1458287526359076945", // 📰-海外最新情報
        QUEST: "1458287551701061653", // 🏆-クエスト
        TICKET: "1457033381098295348", // 🎟️-チケット予約
        GALLERY: "1458360815647461500" // 🖼️-ギャラリー
    },
    CATEGORIES: {
        PUBLIC: "1457033359472590952", // 🌍 PUBLIC ZONE
        WEBINAR: "1457033383971389531", // 🎤 WEBINAR ZONE
        APPLY: "1457033395216322641", // 🤝 APPLY ZONE (Assuming this is "Dependency")
        ARTISTRY: "1457033404833992737" // 👑 ARTISTORY ZONE
    }
};

client.once('ready', async () => {
    try {
        const guild = client.guilds.cache.first();
        if (!guild) throw new Error("No guild found");
        console.log(`Optimizing Guild: ${guild.name}`);

        // 1. Cleanup Duplicates
        console.log("--- Deleting Duplicates ---");
        for (const id of DELETE_IDS) {
            const channel = guild.channels.cache.get(id);
            if (channel) {
                console.log(`Deleting: ${channel.name} (${channel.id})`);
                await channel.delete().catch(e => console.error(`Failed to delete ${id}:`, e));
            }
        }

        // 2. Fetch Roles
        const roles = await ensureRoles(guild);
        const { everyone } = guild.roles;
        const manageRole = roles["運営"];
        const artistryRole = roles["アーティストリー"];
        const applyRole = roles["アプライ"];

        // 3. Update Permissions on EXISTING Channels

        // --- Orphan: Read Me ---
        await updateChannel(guild, TARGETS.CHANNELS.README, [
            { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
            { id: manageRole.id, allow: [PermissionFlagsBits.SendMessages] }
        ]);

        // --- Category: Public Zone ---
        await updateChannel(guild, TARGETS.CATEGORIES.PUBLIC, [
            { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel] }
        ]);

        const readOnlyOps = [
            { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
            { id: manageRole.id, allow: [PermissionFlagsBits.SendMessages] }
        ];

        await updateChannel(guild, TARGETS.CHANNELS.LIVE_ANNOUNCE, readOnlyOps);
        await updateChannel(guild, TARGETS.CHANNELS.ARCHIVE, readOnlyOps);
        await updateChannel(guild, TARGETS.CHANNELS.NEWS, readOnlyOps);
        await updateChannel(guild, TARGETS.CHANNELS.RANKING, readOnlyOps);

        // Social: Everyone Read/Write
        await updateChannel(guild, TARGETS.CHANNELS.SOCIAL, [
            { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]);

        // Quest: Read-Only Channel, Threads OK
        await updateChannel(guild, TARGETS.CHANNELS.QUEST, [
            {
                id: everyone.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.CreatePublicThreads],
                deny: [PermissionFlagsBits.SendMessages]
            },
            { id: manageRole.id, allow: [PermissionFlagsBits.SendMessages] }
        ]);

        // Ticket: Read-Only (Buttons only)
        // Ensure it is in Public Zone? Or leave in Apply Zone? 
        // User asked for "Ticket Reservation... in Public Zone" (implied by list order). 
        // Existing is in "Apply Zone". I will MOVE it to Public Zone if requested, 
        // but user said "Optimize existing". 
        // Current state: Ticket is in APPLY ZONE.
        // User requirements: "Dependency is for Apply role". "Ticket is... button only".
        // If Ticket is in Dependency/Apply Zone, normal users can't see it (if we hide Apply Zone).
        // So Ticket MUST be moved to Public Zone (or visible).
        // Let's MOVE Ticket to Public Category.
        const ticketChannel = guild.channels.cache.get(TARGETS.CHANNELS.TICKET);
        if (ticketChannel) {
            console.log("Moving Ticket Channel to Public Category...");
            await ticketChannel.setParent(TARGETS.CATEGORIES.PUBLIC);
            await updateChannel(guild, TARGETS.CHANNELS.TICKET, [
                { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
                { id: manageRole.id, allow: [PermissionFlagsBits.SendMessages] }
            ]);
        }

        // --- Category: Webinar Zone ---
        // Admin Event Management
        // Category permissions
        await updateChannel(guild, TARGETS.CATEGORIES.WEBINAR, [
            { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.ManageEvents] },
            { id: manageRole.id, allow: [PermissionFlagsBits.ManageEvents] }
        ]);


        // --- Category: Apply Zone (Dependency) ---
        // Visible ONLY to Apply Role + Admin
        await updateChannel(guild, TARGETS.CATEGORIES.APPLY, [
            { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: applyRole.id, allow: [PermissionFlagsBits.ViewChannel] },
            { id: manageRole.id, allow: [PermissionFlagsBits.ViewChannel] }
        ]);

        // --- Category: Artistry Zone ---
        await updateChannel(guild, TARGETS.CATEGORIES.ARTISTRY, [
            { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.ManageEvents] },
            { id: artistryRole.id, allow: [PermissionFlagsBits.ManageEvents] },
            { id: manageRole.id, allow: [PermissionFlagsBits.ManageEvents] }
        ]);

        // Gallery: Thread Write -> Artistry Only
        await updateChannel(guild, TARGETS.CHANNELS.GALLERY, [
            {
                id: everyone.id,
                allow: [PermissionFlagsBits.ViewChannel],
                deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.CreatePublicThreads]
            },
            {
                id: artistryRole.id,
                allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.CreatePublicThreads]
            },
            { id: manageRole.id, allow: [PermissionFlagsBits.SendMessages] }
        ]);

        console.log("Cleanup and Optimization Complete!");
        process.exit(0);

    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
});

async function updateChannel(guild: Guild, id: string, permissions: any[]) {
    const channel = guild.channels.cache.get(id);
    if (!channel) {
        console.warn(`Channel not found for update: ${id}`);
        return;
    }
    console.log(`Updating Permissions: ${channel.name}`);
    await channel.edit({ permissionOverwrites: permissions });
}

async function ensureRoles(guild: Guild) {
    const roleNames = ["運営", "アーティストリー", "アプライ"];
    const roleMap: Record<string, Role> = {};

    for (const name of roleNames) {
        let role = guild.roles.cache.find(r => r.name === name);
        if (!role) {
            console.log(`Creating required role (unexpectedly missing): ${name}`);
            role = await guild.roles.create({ name });
        }
        roleMap[name] = role;
    }
    return roleMap;
}

client.login(CONFIG.DISCORD.TOKEN);
