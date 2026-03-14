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
 *   --contactId, CONTACT_ID  Contact ID to send to (required for send)
 *   --message, MESSAGE       Message text (required for send)
 *   --check-only             Only verify connection and active user, don't send
 *   --debug                  Verbose output for debugging
 *
 * Inside n8n container, you can use env vars from your setup.
 */

import { ChatClient } from 'simplex-chat';
import { T } from '@simplex-chat/types';

interface ParsedArgs {
  host: string;
  port: number;
  contactId: number | null;
  message: string;
  checkOnly: boolean;
  debug: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const getArg = (name: string, envKey: string, defaultValue?: string): string => {
    const idx = args.indexOf(name);
    const value =
      idx >= 0 && args[idx + 1] !== undefined
        ? args[idx + 1]
        : (process.env[envKey] ?? defaultValue);
    return value ?? '';
  };
  const hasFlag = (name: string): boolean => args.includes(name);

  const host = getArg('--host', 'SIMPLEX_HOST', 'localhost');
  const port = parseInt(getArg('--port', 'SIMPLEX_PORT', '5225'), 10);
  const contactIdStr = getArg('--contactId', 'CONTACT_ID');
  const message = getArg('--message', 'MESSAGE');
  const checkOnly = hasFlag('--check-only');
  const debug = hasFlag('--debug');

  if (!checkOnly && (!contactIdStr || !message)) {
    console.error(
      'Usage: node send-message.js [--check-only] [--debug] --host <host> --port <port> --contactId <id> --message <text>'
    );
    console.error('  Or set env vars: SIMPLEX_HOST, SIMPLEX_PORT, CONTACT_ID, MESSAGE');
    console.error('  Use --check-only to verify connection without sending');
    process.exit(1);
  }

  const contactId = contactIdStr ? parseInt(contactIdStr, 10) : null;
  if (contactIdStr && isNaN(contactId!)) {
    console.error('contactId must be a number');
    process.exit(1);
  }

  return { host, port, contactId, message, checkOnly, debug };
}

function formatError(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const resp = (error as { response?: unknown }).response;
    return JSON.stringify(resp, null, 2);
  }
  return String(error);
}

async function main() {
  const { host, port, contactId, message, checkOnly, debug } = parseArgs();
  const wsUrl = `ws://${host}:${port}`;

  if (debug) {
    console.log('[debug] Config:', { host, port, contactId, message, checkOnly });
  }
  console.log(`Connecting to ${wsUrl}...`);

  try {
    const chat = await ChatClient.create(wsUrl);
    if (debug) console.log('[debug] WebSocket connected');

    const user = await chat.apiGetActiveUser();
    if (!user) {
      console.error(
        'ERROR: No active user in SimpleX CLI.\n' +
          '  Create a profile first (e.g. run simplex-chat interactively or ensure profile exists).\n' +
          '  See: https://github.com/simplex-chat/simplex-chat/blob/stable/docs/CLI.md'
      );
      process.exit(1);
    }
    console.log(`Active user: ${user.profile.displayName} (userId: ${user.userId})`);

    if (checkOnly) {
      console.log('Check complete. Connection OK, active user present.');
      return;
    }

    if (!message || message.trim() === '') {
      console.error(
        'ERROR: Message cannot be empty (triggers "Failed reading: empty" in SimpleX CLI).'
      );
      process.exit(1);
    }

    console.log(`Sending to contact ${contactId}: "${message}"`);

    const resultItems = await chat.apiSendTextMessage(T.ChatType.Direct, contactId!, message);

    console.log('Success:', {
      contactId,
      result: resultItems.map((item) => ({
        infoType: item.chatInfo.type,
        itemChatDir: item.chatItem.chatDir,
      })),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error sending message:');
    console.error('  Message:', error instanceof Error ? error.message : String(error));
    console.error('  Response payload:', formatError(error));
    if (debug && error instanceof Error && 'response' in error) {
      console.error('  Full error:', error);
    }
    process.exit(1);
  }
}

main();
