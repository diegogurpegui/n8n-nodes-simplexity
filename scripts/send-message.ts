/**
 * Test script to send a message via SimpleX.
 * Emulates Simplexity.node.ts behavior for server-side debugging.
 *
 * Usage (after npm run build):
 *   npm run send-message -- [options]
 *   node dist/scripts/send-message.js [options]
 *
 * Options (CLI or env):
 *   --host, SIMPLEX_HOST     SimpleX CLI host (default: localhost)
 *   --port, SIMPLEX_PORT     SimpleX CLI port (default: 5225)
 *   --contactId, CONTACT_ID  Contact ID to send to (required)
 *   --message, MESSAGE       Message text (required)
 *
 * Inside n8n container, you can use env vars from your setup.
 */

import { ChatClient } from 'simplex-chat';
import { T } from '@simplex-chat/types';

function parseArgs(): { host: string; port: number; contactId: number; message: string } {
  const args = process.argv.slice(2);
  const getArg = (name: string, envKey: string, defaultValue?: string): string => {
    const idx = args.indexOf(name);
    const value =
      idx >= 0 && args[idx + 1] !== undefined
        ? args[idx + 1]
        : (process.env[envKey] ?? defaultValue);
    return value ?? '';
  };

  const host = getArg('--host', 'SIMPLEX_HOST', 'localhost');
  const port = parseInt(getArg('--port', 'SIMPLEX_PORT', '5225'), 10);
  const contactIdStr = getArg('--contactId', 'CONTACT_ID');
  const message = getArg('--message', 'MESSAGE');

  if (!contactIdStr || !message) {
    console.error(
      'Usage: node send-message.js --host <host> --port <port> --contactId <id> --message <text>'
    );
    console.error('  Or set env vars: SIMPLEX_HOST, SIMPLEX_PORT, CONTACT_ID, MESSAGE');
    process.exit(1);
  }

  const contactId = parseInt(contactIdStr, 10);
  if (isNaN(contactId)) {
    console.error('contactId must be a number');
    process.exit(1);
  }

  return { host, port, contactId, message };
}

async function main() {
  const { host, port, contactId, message } = parseArgs();
  const wsUrl = `ws://${host}:${port}`;

  console.log(`Connecting to ${wsUrl}...`);
  console.log(`Sending to contact ${contactId}: "${message}"`);

  try {
    const chat = await ChatClient.create(wsUrl);
    const resultItems = await chat.apiSendTextMessage(T.ChatType.Direct, contactId, message);

    console.log('Success:', {
      contactId,
      result: resultItems.map((item) => ({
        infoType: item.chatInfo.type,
        itemChatDir: item.chatItem.chatDir,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorStr = JSON.stringify(error, null, 2);
    console.error('Error sending message:', {error, errorStr});
    process.exit(1);
  }
}

main();
