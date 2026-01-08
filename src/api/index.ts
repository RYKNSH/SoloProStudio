import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { installDiscordTools, startDiscordClient } from "../discord_server.js";
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Global server instance to reuse connection if lambda is warm
let server: McpServer | null = null;
let transport: SSEServerTransport | null = null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (!server) {
        server = new McpServer({
            name: "discord-driver",
            version: "1.0.0",
        });
        installDiscordTools(server);
    }

    // Ensure Discord is connected
    try {
        await startDiscordClient();
    } catch (e) {
        console.error("Discord Login Failed", e);
        return res.status(500).send("Internal Server Error: Discord Login Failed");
    }

    if (req.method === "GET") {
        // Start SSE Session
        transport = new SSEServerTransport("/api/mcp", res);
        await server.connect(transport);
        // Transport handles sending headers and keeping connection open
        return;
    } else if (req.method === "POST") {
        // Handle JSON-RPC Message
        if (!transport) {
            // If transport isn't initialized, we can't handle post (stateless HTTP needs session mapping)
            // SSE Transport usually works by creating a transport per session.
            // In Serverless, memory is not shared between requests.
            // WE CANNOT DO SSE MCP ON SERVERLESS WITHOUT EXTERNAL STORAGE (Redis/DB).
            // OR use a single long-lived connection (not possible for POST+GET split).

            // ALTERNATIVE: Use simple HTTP transport (Post=Request, Response=Result).
            // standard MCP doesn't support "Simple HTTP" yet, it expects JSON-RPC connection.

            // Fallback: This handler is likely for "Stdio" usage via Vercel isn't right.
            // BUT mcp-handler handles this mapping.

            return res.status(400).send("Session not found (Serverless limitation: use mcp-handler with Redis)");
        }
        await transport.handlePostMessage(req, res);
        return;
    }

    res.status(405).send("Method Not Allowed");
}
