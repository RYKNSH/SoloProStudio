import {
    InteractionType,
    InteractionResponseType,
    verifyKey
} from 'discord-interactions';
import type { VercelRequest, VercelResponse } from '@vercel/node';
// import { handleTicketInteraction } from '../concierge/tickets.js'; // Disabled: Gateway Only Mode

import { CONFIG } from "../config.js";

// Environment variables
const PUBLIC_KEY = CONFIG.DISCORD.PUBLIC_KEY;

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // 1. Verify Request Signature
    const signature = req.headers['x-signature-ed25519'] as string;
    const timestamp = req.headers['x-signature-timestamp'] as string;
    const rawBody = JSON.stringify(req.body);

    if (!PUBLIC_KEY) {
        console.error('Missing DISCORD_PUBLIC_KEY');
        return res.status(500).send('Configuration Error');
    }

    const isValidRequest = verifyKey(rawBody, signature, timestamp, PUBLIC_KEY);
    if (!isValidRequest) {
        return res.status(401).send('Bad Request Signature');
    }

    // 2. Handle Interactions
    const interaction = req.body;

    // PING Check (Required for Webhook Verification)
    if (interaction.type === InteractionType.PING) {
        return res.status(200).json({ type: InteractionResponseType.PONG });
    }

    // Application Commands or Message Components (Buttons, etc.)
    if (interaction.type === InteractionType.APPLICATION_COMMAND || interaction.type === InteractionType.MESSAGE_COMPONENT) {
        // Return ephemeral error message instructing to switch to Gateway
        return res.status(200).json({
            type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
            data: {
                content: '⚠️ **Configuration Error**\nThis bot is running in Gateway mode. Please remove the **Interactions Endpoint URL** in the Discord Developer Portal to enable buttons and commands.',
                flags: 64 // Ephemeral
            }
        });
    }

    return res.status(400).send('Unknown Interaction Type');
}
