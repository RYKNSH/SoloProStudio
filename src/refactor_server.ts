import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import "dotenv/config";

async function main() {
    const transport = new StdioClientTransport({
        command: "node",
        args: ["--import", "tsx/esm", "discord_server.ts"],
    });

    const client = new Client({ name: "refactor-script", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);

    console.log("Waiting for bot to be ready...");
    await new Promise(r => setTimeout(r, 3000)); // Simple wait for connection

    console.log("Renaming Learning Channel...");
    await client.request(
        { method: "tools/call", params: { name: "update_channel", arguments: { channel_id: "1458287526359076945", name: "📰-海外最新情報" } } },
        CallToolResultSchema
    );

    console.log("Deleting Webinar Calendar...");
    await client.request(
        { method: "tools/call", params: { name: "delete_channel", arguments: { channel_id: "1457033385951236385" } } },
        CallToolResultSchema
    );

    console.log("Deleting QA Forum...");
    await client.request(
        { method: "tools/call", params: { name: "delete_channel", arguments: { channel_id: "1458287521455800412" } } },
        CallToolResultSchema
    );

    console.log("Renaming Community Channel...");
    await client.request(
        { method: "tools/call", params: { name: "update_channel", arguments: { channel_id: "1457033375658283194", name: "🥂-ソーシャルラウンジ" } } },
        CallToolResultSchema
    );

    console.log("Done!");
    process.exit(0);
}

main().catch(console.error);
