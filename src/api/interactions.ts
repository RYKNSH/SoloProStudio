import {
    InteractionType,
    InteractionResponseType,
    verifyKey
} from 'discord-interactions';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleTicketInteraction } from '../concierge/tickets.js';

// Environment variables
const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

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
        try {
            // Processing Ticket/Concierge interactions
            // We pass the RAW interaction object to the handler.
            // The handler must return a JSON response compatible with Discord Webhooks.
            const response = await handleTicketInteraction(interaction);
            if (response) {
                return res.status(200).json(response);
            }
        } catch (error) {
            console.error('Interaction Handling Error:', error);
            // Return ephemeral error message
            return res.status(200).json({
                type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
                data: {
                    content: 'エラーが発生しました。',
                    flags: 64 // Ephemeral
                }
            });
        }
    }

    return res.status(400).send('Unknown Interaction Type');
}
