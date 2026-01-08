import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import "dotenv/config";

async function main() {
    const transport = new StdioClientTransport({
        command: "node",
        args: ["--import", "tsx/esm", "discord_server.ts"],
    });

    const client = new Client(
        {
            name: "discord-kernel",
            version: "1.0.0",
        },
        {
            capabilities: {},
        }
    );

    console.log("Connecting to Discord Driver...");
    await client.connect(transport);
    console.log("Connected!");

    // Verify connection by listing tools
    const result = await client.request(
        { method: "tools/list" },
        ListToolsResultSchema
    );

    console.log("Available Tools:");
    result.tools.forEach((tool) => {
        console.log(`- ${tool.name}: ${tool.description}`);
    });

    // Keep alive or exit
    // process.exit(0);
}

main().catch((err) => {
    console.error("Kernel Error:", err);
});
