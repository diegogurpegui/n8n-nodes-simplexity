# SimpleX Chat Reference for AI Agents & Developers

Reference document for debugging SimpleX Chat integration issues and adding features to the n8n SimpleXity nodes.

---

## Quick Context

This project uses:
- **simplex-chat** npm package – `ChatClient` for WebSocket connection and API calls
- **@simplex-chat/types** – Types: `T.ChatInfo`, `T.ChatItem`, `T.CIFile`, `T.ChatType`, `ChatResponse`

**Important:** The WebSocket/CLI JSON protocol is not fully documented. The TypeScript client and `@simplex-chat/types` are the main references for command/response structure.

---

## Reference Sources

### Official Documentation

| Source | Use For |
|--------|---------|
| [SimpleX Chat Protocol](https://simplex.chat/docs/protocol/simplex-chat.html) | Message format, events, JSON schema |
| [Sending messages guide](https://simplex.chat/docs/guide/send-messages.html) | How to send messages |
| [CLI documentation](https://github.com/simplex-chat/simplex-chat/blob/stable/docs/CLI.md) | CLI usage, options, setup |

### Package & API Reference

| Source | Use For |
|--------|---------|
| [simplex-chat npm](https://www.npmjs.com/package/simplex-chat) | README, quick start, use cases |
| [client.ts source](https://github.com/simplex-chat/simplex-chat/blob/stable/packages/simplex-chat-client/typescript/src/client.ts) | API methods, behavior, available operations |
| [squaring-bot example](https://github.com/simplex-chat/simplex-chat/blob/stable/packages/simplex-chat-client/typescript/examples/squaring-bot.js) | Example bot using the API |

### Commands & Types

| Source | Use For |
|--------|---------|
| [@simplex-chat/types npm](https://www.npmjs.com/package/@simplex-chat/types) | Bot API types |
| [commands.js (0.3.0)](https://unpkg.com/@simplex-chat/types@0.3.0/dist/commands.js) | CLI command structure (e.g. `/_send`, `/_group`) |

### Repository Structure

| Source | Use For |
|--------|---------|
| [simplex-chat GitHub](https://github.com/simplex-chat/simplex-chat) | Main repo, issues, PRs |
| [TypeScript client package](https://github.com/simplex-chat/simplex-chat/tree/stable/packages/simplex-chat-client/typescript) | Client package layout, examples |

---

## Debugging Checklist

1. **Connection issues** – Check CLI docs for host/port (default 5225), ensure SimpleX CLI is running
2. **Event types** – Use Protocol docs + `@simplex-chat/types` to verify event names (`newChatItems`, `rcvFileAccepted`, etc.)
3. **Send/receive format** – Use Sending messages guide + `client.ts` for `apiSendTextMessage` and related methods
4. **Type mismatches** – Inspect `@simplex-chat/types` and `commands.js` for expected shapes
5. **Unknown commands** – Search `client.ts` and examples for similar usage

---

## Project-Specific Notes

- **Trigger events (selectable):** `newChatItems`, `contactConnected`, `contactConnecting`, `receivedContactRequest`, `rcvFileAccepted`, `rcvFileStart`, `rcvFileComplete`, `chatItemUpdated`, `chatItemDeleted`
- **newChatItems content types:** text, link, voice, file, image, video. Voice/audio messages have `msgContent.type === 'voice'` (text may be empty). File invitations use `content.type === 'rcvFileInvitation'`.
- **Audio flow:** Voice message → `newChatItems` with `rcvFileInvitation` (file offer) → call `apiReceiveFile(fileId)` to accept → `rcvFileAccepted` (notification) → `rcvFileComplete` (file ready). Do not call `apiReceiveFile` on `rcvFileAccepted`; it causes "error receiving file".
- **Debug logging:** Trigger logs `[SimpleXity]` prefixed messages; set log level to debug to see raw response structure.
- **Action:** Uses `chat.apiSendTextMessage(T.ChatType.Direct, contactId, message)`
- **Credentials:** Host, port, optional bot address – see `credentials/SimplexityApi.credentials.ts`
