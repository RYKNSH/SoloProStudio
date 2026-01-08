
import {
    Client,
    GatewayIntentBits,
    ChannelType,
    PermissionFlagsBits,
    OverwriteType,
    Guild,
    Role,
    CategoryChannel
} from "discord.js";
import "dotenv/config";
import { CONFIG } from "../config.js";

console.log("Script starting...");

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
    try {
        console.log(`Logged in as ${client.user?.tag}`);
        const guild = client.guilds.cache.first();
        if (!guild) throw new Error("No guild found");
        console.log(`Found Guild: ${guild.name} (${guild.id})`);

        // 1. Rename Server
        if (guild.name !== "SoloPro Studio") {
            console.log(`Renaming server from '${guild.name}' to 'SoloPro Studio'...`);
            await guild.setName("SoloPro Studio");
        } else {
            console.log("Server name is already 'SoloPro Studio'.");
        }

        // 2. Ensure Roles
        const roles = await ensureRoles(guild);

        // 3. Configure Categories and Channels
        await configureOnboarding(guild, roles);
        await configurePublicZone(guild, roles);
        await configureWebinarZone(guild, roles);
        await configureDependencyZone(guild, roles);
        await configureArtistryZone(guild, roles);

        console.log("Configuration Complete!");
        process.exit(0);
    } catch (error) {
        console.error("Error during configuration:", error);
        process.exit(1);
    }
});

async function ensureRoles(guild: Guild) {
    console.log("Checking roles...");
    const roleNames = [
        { name: "運営", color: "#E91E63", hoist: true }, // Manage (Pink)
        { name: "アーティストリー", color: "#9C27B0", hoist: true }, // Artistry (Purple)
        { name: "アプライ", color: "#2196F3", hoist: false } // Apply (Blue)
    ];

    const roleMap: Record<string, Role> = {};

    for (const def of roleNames) {
        let role = guild.roles.cache.find(r => r.name === def.name);
        if (!role) {
            console.log(`Creating role: ${def.name}`);
            role = await guild.roles.create({
                name: def.name,
                color: def.color as any,
                hoist: def.hoist,
                reason: "Auto-configuration"
            });
        } else {
            // console.log(`Role exists: ${def.name}`);
        }
        roleMap[def.name] = role;
    }
    return roleMap;
}

// --- Category Helpers ---

async function ensureCategory(guild: Guild, name: string, permissions: any[] = []) {
    let category = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === name) as CategoryChannel;

    if (!category) {
        console.log(`Creating Category: ${name}`);
        category = await guild.channels.create({
            name,
            type: ChannelType.GuildCategory,
            permissionOverwrites: permissions
        });
    } else {
        // Optional: Update permissions if they differ?
        // For now, only create if missing or manually implemented update logic if strictly required.
        // User asked to *change* permissions, so we should probably enforce them.
        // console.log(`Updating permissions for Category: ${name}`);
        await category.edit({ permissionOverwrites: permissions });
    }
    return category;
}

async function ensureChannel(guild: Guild, name: string, parentId: string | null, permissions: any[] = [], type = ChannelType.GuildText) {
    let channel = guild.channels.cache.find(c => c.name === name && c.parentId === parentId);

    if (!channel) {
        console.log(`Creating Channel: ${name}`);
        channel = await guild.channels.create({
            name,
            type,
            parent: parentId,
            permissionOverwrites: permissions
        });
    } else {
        // console.log(`Updating permissions for Channel: ${name}`);
        await channel.edit({ permissionOverwrites: permissions });
    }
    return channel;
}

// --- Zone Configurations ---

async function configureOnboarding(guild: Guild, roles: Record<string, Role>) {
    console.log("Configuring Onboarding...");
    const categoryName = "ONBOARDING";
    const everyone = guild.roles.everyone;
    const manageRole = roles["運営"];

    const categoryPerms = [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: manageRole.id, allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }
    ];

    const category = await ensureCategory(guild, categoryName, categoryPerms);

    await ensureChannel(guild, "初めに読んでね", category.id, [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: manageRole.id, allow: [PermissionFlagsBits.SendMessages] }
    ]);
}

async function configurePublicZone(guild: Guild, roles: Record<string, Role>) {
    console.log("Configuring Public Zone...");
    const categoryName = "パブリックゾーン";
    const everyone = guild.roles.everyone;
    const manageRole = roles["運営"];

    const categoryPerms = [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel] }
    ];
    const category = await ensureCategory(guild, categoryName, categoryPerms);

    const readOnlyOps = [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: manageRole.id, allow: [PermissionFlagsBits.SendMessages] }
    ];

    await ensureChannel(guild, "ライブ告知", category.id, readOnlyOps);
    await ensureChannel(guild, "アーカイブ", category.id, readOnlyOps);
    await ensureChannel(guild, "海外最新情報", category.id, readOnlyOps);
    await ensureChannel(guild, "ランキング", category.id, readOnlyOps);

    await ensureChannel(guild, "ソーシャルラウンジ", category.id, [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
    ]);

    // Quest: everyone can send in threads, create public threads. NOT send in channel.
    await ensureChannel(guild, "クエスト", category.id, [
        {
            id: everyone.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessagesInThreads, PermissionFlagsBits.CreatePublicThreads],
            deny: [PermissionFlagsBits.SendMessages]
        },
        { id: manageRole.id, allow: [PermissionFlagsBits.SendMessages] }
    ]);

    await ensureChannel(guild, "チケット予約", category.id, [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.SendMessages] },
        { id: manageRole.id, allow: [PermissionFlagsBits.SendMessages] }
    ]);
}

async function configureWebinarZone(guild: Guild, roles: Record<string, Role>) {
    console.log("Configuring Webinar Zone...");
    const categoryName = "ウェビナーゾーン";
    const everyone = guild.roles.everyone;
    const manageRole = roles["運営"];

    const categoryPerms = [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.ManageEvents] },
        { id: manageRole.id, allow: [PermissionFlagsBits.ManageEvents] }
    ];

    await ensureCategory(guild, categoryName, categoryPerms);
}

async function configureDependencyZone(guild: Guild, roles: Record<string, Role>) {
    console.log("Configuring Dependency (Izon) Zone...");
    const categoryName = "依存";
    const everyone = guild.roles.everyone;
    const applyRole = roles["アプライ"];
    const manageRole = roles["運営"];

    const categoryPerms = [
        { id: everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: applyRole.id, allow: [PermissionFlagsBits.ViewChannel] },
        { id: manageRole.id, allow: [PermissionFlagsBits.ViewChannel] }
    ];

    await ensureCategory(guild, categoryName, categoryPerms);
}

async function configureArtistryZone(guild: Guild, roles: Record<string, Role>) {
    console.log("Configuring Artistry Zone...");
    const categoryName = "アーティストリーゾーン";
    const everyone = guild.roles.everyone;
    const artistryRole = roles["アーティストリー"];
    const manageRole = roles["運営"];

    const category = await ensureCategory(guild, categoryName, [
        { id: everyone.id, allow: [PermissionFlagsBits.ViewChannel], deny: [PermissionFlagsBits.ManageEvents] },
        { id: artistryRole.id, allow: [PermissionFlagsBits.ManageEvents] },
        { id: manageRole.id, allow: [PermissionFlagsBits.ManageEvents] }
    ]);

    await ensureChannel(guild, "ギャラリー", category.id, [
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
}

console.log("Logging in...");
client.login(CONFIG.DISCORD.TOKEN).catch(e => {
    console.error("Login Failed:", e);
    process.exit(1);
});
