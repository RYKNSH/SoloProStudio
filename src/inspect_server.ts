import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema, ListToolsResultSchema } from "@modelcontextprotocol/sdk/types.js";
import "dotenv/config";
import fs from "fs";

async function main() {
    const transport = new StdioClientTransport({
        command: "node",
        args: ["--import", "tsx/esm", "discord_server.ts"],
    });

    const client = new Client(
        {
            name: "discord-inspector",
            version: "1.0.0",
        },
        {
            capabilities: {},
        }
    );

    console.log("Connecting to Discord Driver...");
    await client.connect(transport);
    console.log("Connected!");

    // List Channels
    console.log("Fetching channels...");
    const result = await client.request(
        {
            method: "tools/call",
            params: {
                name: "list_channels",
                arguments: {},
            },
        },
        CallToolResultSchema
    );

    if (result.content[0].type === "text") {
        const output = result.content[0].text;
        console.log(output);
        fs.writeFileSync("server_inspection.txt", output);
        console.log("Inspection saved to server_inspection.txt");
    }

    process.exit(0);
}

main().catch((err) => {
    console.error("Inspector Error:", err);
    process.exit(1);
});
