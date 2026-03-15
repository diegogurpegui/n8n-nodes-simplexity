import {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  ITriggerFunctions,
  ITriggerResponse,
  NodeConnectionType,
  NodeApiError,
} from 'n8n-workflow';
import { ChatClient } from 'simplex-chat';
// import { ciContentText } from 'simplex-chat/dist/response';
import type { T, ChatResponse } from '@simplex-chat/types';

function isAudioFile(fileName: string): boolean {
  return /\.(ogg|m4a|mp3|wav|opus|aac)$/i.test(fileName);
}

interface SimplexityTriggerOutput extends IDataObject {
  messageType: string;
  timestamp: string;
  messages?: Array<{
    chatInfo: T.ChatInfo;
    chatItem: T.ChatItem;
    message: string;
  }>;
  files?: Array<{
    chatInfo: T.ChatInfo;
    chatItem: T.ChatItem;
    file: T.CIFile;
  }>;
  contact?: {
    contactId: number;
    profile: {
      displayName: string;
      fullName?: string;
    };
  };
  contactRequest?: T.UserContactRequest;
  chatItem?: T.AChatItem;
  deletedChatItem?: T.AChatItem;
}

export class SimplexityTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'SimpleXity Trigger',
    name: 'simplexityTrigger',
    icon: 'file:simplexity.svg',
    group: ['trigger'],
    version: 1,
    subtitle: 'Triggers when a new message is received',
    description: 'Triggers workflows when SimpleX messages are received',
    defaults: {
      name: 'simplexityTrigger',
    },
    inputs: [],
    outputs: [NodeConnectionType.Main],
    credentials: [
      {
        name: 'simplexityApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Message Types',
        name: 'messageTypes',
        type: 'multiOptions',
        options: [
          {
            name: 'Text Messages',
            value: 'newChatItems',
          },
          {
            name: 'Contact Connected',
            value: 'contactConnected',
          },
          {
            name: 'Contact Connecting',
            value: 'contactConnecting',
          },
          {
            name: 'Contact Request Received',
            value: 'receivedContactRequest',
          },
          {
            name: 'File Offered',
            value: 'rcvFileAccepted',
          },
          {
            name: 'File Transfer Started',
            value: 'rcvFileStart',
          },
          {
            name: 'File Received',
            value: 'rcvFileComplete',
          },
          {
            name: 'Message Updated',
            value: 'chatItemUpdated',
          },
          {
            name: 'Message Deleted',
            value: 'chatItemDeleted',
          },
        ],
        default: ['newChatItems'],
        description: 'Types of messages to trigger on',
      },
    ],
  };

  async trigger(this: ITriggerFunctions): Promise<ITriggerResponse> {
    const credentials = await this.getCredentials('simplexityApi');

    // Validate credentials
    if (!credentials.host || !credentials.port) {
      throw new NodeApiError(this.getNode(), {
        message: 'Host and port are required in SimpleXity API credentials',
      });
    }

    const messageTypes = this.getNodeParameter('messageTypes', []) as string[];

    // Connection state management
    let chat: ChatClient | null = null;
    let isConnected = false;
    let shouldStop = false;

    /**
     * Connect to the SimpleXity server and get the active user.
     * @returns The chat client.
     */
    const connect = async (): Promise<ChatClient> => {
      try {
        console.debug(`Connecting to SimpleXity at ${credentials.host}:${credentials.port}`);
        const chatClient = await ChatClient.create(`ws://${credentials.host}:${credentials.port}`);
        isConnected = true;

        let activeUser = await chatClient.apiGetActiveUser();
        if (!activeUser) {
          console.debug('No active user found, creating new one...');
          activeUser = await chatClient.apiCreateActiveUser();
        }

        console.debug('Active user:', {
          displayName: activeUser.profile.displayName,
          userId: activeUser.userId,
        });

        // Get or create bot address
        let address =
          credentials.botAddress || (await chatClient.apiGetUserAddress(activeUser.userId));
        if (!address) {
          address = await chatClient.apiCreateUserAddress(activeUser.userId);
          console.debug(`Created new bot address: ${address}`);
        } else {
          console.debug(`Using existing bot address: ${address}`);
        }

        // Enable automatic acceptance of contact connections
        // This may fail if already enabled or if the server doesn't support it
        try {
          await chatClient.enableAddressAutoAccept(activeUser.userId);
          console.debug('Enabled automatic address acceptance');
        } catch (error) {
          console.warn(
            `Failed to enable automatic address acceptance: ${error instanceof Error ? error.message : 'Unknown error'}. Continuing anyway...`
          );
          // Don't fail the connection if this doesn't work - the bot can still function
        }

        return chatClient;
      } catch (error) {
        isConnected = false;
        console.error('Failed to connect to SimpleX:', error);
        throw new NodeApiError(this.getNode(), {
          message: `Failed to connect to SimpleX: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    };

    const processIncomingMessages = async () => {
      if (!chat) {
        console.error('No chat client found');
        return;
      }

      try {
        for await (const response of chat.msgQ) {
          // Check if we should stop processing
          if (shouldStop || !isConnected) {
            console.debug('Stopping message processing');
            break;
          }

          try {
            const resp = (response instanceof Promise ? await response : response) as ChatResponse;

            // Validate response format
            if (!resp || typeof resp.type !== 'string') {
              console.warn('Invalid response format:', resp);
              continue;
            }

            const respType = resp.type as string;

            // Debug: log raw response structure (helps diagnose audio/voice messages)
            console.debug(`[SimpleXity] Received: type=${respType}`, {
              chatItemsCount: 'chatItems' in resp ? resp.chatItems?.length : undefined,
              chatItem:
                'chatItem' in resp
                  ? {
                      contentType: (
                        resp as { chatItem?: { chatItem?: { content?: { type?: string } } } }
                      ).chatItem?.chatItem?.content?.type,
                    }
                  : undefined,
            });

            // Always accept audio files on rcvFileAccepted (even if not in messageTypes)
            if (respType === 'rcvFileAccepted' && chat) {
              const rcvResp = resp as {
                chatItem?: {
                  chatInfo?: T.ChatInfo;
                  chatItem?: { file?: { fileId: number; fileName?: string } };
                };
              };
              const file = rcvResp.chatItem?.chatItem?.file;
              if (file && isAudioFile(file.fileName ?? '')) {
                try {
                  await chat.apiReceiveFile(file.fileId);
                  console.debug(`[SimpleXity] Auto-accepted audio file: ${file.fileName}`);
                } catch (err) {
                  console.error('[SimpleXity] Failed to accept audio file:', err);
                }
              }
            }

            // Check if this message type should trigger
            if (!messageTypes.includes(respType)) {
              console.debug(`Skipping message type: ${respType}`);
              continue;
            }

            let outputData: SimplexityTriggerOutput = {
              messageType: resp.type,
              timestamp: new Date().toISOString(),
            };

            switch (respType) {
              case 'contactConnected':
              case 'contactConnecting': {
                const r = resp as { contact?: T.Contact };
                if (r.contact) {
                  outputData.contact = {
                    contactId: r.contact.contactId,
                    profile: {
                      displayName: r.contact.profile?.displayName ?? '',
                      fullName: r.contact.profile?.fullName,
                    },
                  };
                }
                break;
              }
              case 'receivedContactRequest': {
                const r = resp as { contactRequest?: T.UserContactRequest };
                if (r.contactRequest) outputData.contactRequest = r.contactRequest;
                break;
              }
              case 'chatItemUpdated': {
                const r = resp as { chatItem?: T.AChatItem };
                if (r.chatItem) outputData.chatItem = r.chatItem;
                break;
              }
              case 'chatItemDeleted': {
                const r = resp as {
                  deletedChatItem?: T.AChatItem;
                  toChatItem?: T.AChatItem;
                  byUser?: boolean;
                };
                if (r.deletedChatItem) outputData.deletedChatItem = r.deletedChatItem;
                if (r.toChatItem) outputData.chatItem = r.toChatItem;
                break;
              }
              case 'rcvFileStart': {
                const r = resp as {
                  chatItem?: { chatInfo: T.ChatInfo; chatItem: T.ChatItem & { file?: unknown } };
                };
                if (r.chatItem?.chatItem?.file) {
                  outputData.files = [
                    {
                      chatInfo: r.chatItem.chatInfo,
                      chatItem: r.chatItem.chatItem,
                      file: r.chatItem.chatItem.file as T.CIFile,
                    },
                  ];
                }
                break;
              }
              case 'newChatItems': {
                const messages: SimplexityTriggerOutput['messages'] = [];
                const chatItems =
                  (resp as { chatItems?: Array<{ chatInfo: T.ChatInfo; chatItem: T.ChatItem }> })
                    .chatItems ?? [];
                console.debug(`[SimpleXity] newChatItems: ${chatItems.length} items`);

                for (const { chatInfo, chatItem } of chatItems) {
                  // Only process direct messages
                  if (chatInfo.type !== 'direct') {
                    console.debug(`Skipping non-direct chat: ${chatInfo.type}`);
                    continue;
                  }

                  // rcvFileInvitation: file/voice offer (file not yet received)
                  if ((chatItem.content as { type: string }).type === 'rcvFileInvitation') {
                    const rcvFile = (chatItem.content as { rcvFileTransfer?: { fileId?: number } })
                      .rcvFileTransfer;
                    messages.push({
                      chatInfo,
                      chatItem,
                      message: `[File/voice invitation] fileId=${rcvFile?.fileId ?? '?'}`,
                    });
                    console.debug(
                      `[SimpleXity] Added rcvFileInvitation, fileId=${rcvFile?.fileId}`
                    );
                    continue;
                  }

                  if (chatItem.content.type !== 'rcvMsgContent') {
                    console.debug(
                      `[SimpleXity] Skipping content type: ${chatItem.content.type} (not rcvMsgContent)`
                    );
                    continue;
                  }

                  const msgContent = (chatItem.content as T.CIContent.RcvMsgContent).msgContent;
                  const contentType = (msgContent?.type ?? 'unknown') as string;
                  const text = msgContent?.text ?? '';

                  // Text messages: use text directly
                  if (contentType === 'text' || contentType === 'link') {
                    if (text) {
                      messages.push({ chatInfo, chatItem, message: text });
                    }
                    continue;
                  }

                  // Voice, file, image, video: no text or optional caption
                  if (['voice', 'file', 'image', 'video'].includes(contentType)) {
                    const label =
                      contentType === 'voice' ? '[Voice message]' : `[${contentType} message]`;
                    messages.push({
                      chatInfo,
                      chatItem,
                      message: text || label,
                    });
                    console.debug(
                      `[SimpleXity] Added ${contentType} message, text="${text || '(empty)'}"`
                    );
                    continue;
                  }

                  // Fallback for unknown types (e.g. MCUnknown with type "voice")
                  if (contentType !== 'unknown' && contentType !== 'text') {
                    messages.push({
                      chatInfo,
                      chatItem,
                      message: text || `[${contentType} message]`,
                    });
                  }
                }
                outputData = {
                  ...outputData,
                  messages,
                };
                break;
              }
              case 'rcvFileAccepted': {
                const rcvResp = resp as {
                  chatItem: {
                    chatInfo: T.ChatInfo;
                    chatItem: T.ChatItem & { file?: { fileId: number; fileName?: string } };
                  };
                };
                const file = rcvResp.chatItem.chatItem.file;

                if (!file) {
                  console.error('[SimpleXity] No file in "rcvFileAccepted" message');
                  break;
                }

                // Accept audio files automatically
                let fileReceived: T.CIFile | undefined = undefined;
                if (isAudioFile(file.fileName ?? '') && chat) {
                  try {
                    const fileChatItem = await chat.apiReceiveFile(file.fileId);
                    fileReceived = (fileChatItem.chatItem as { file?: T.CIFile }).file;
                    console.debug(`[SimpleXity] Audio file accepted: ${file.fileName}`);
                  } catch (error) {
                    console.error('[SimpleXity] Error receiving audio file:', error);
                  }
                }

                if (!fileReceived) {
                  console.debug(
                    '[SimpleXity] rcvFileAccepted: file not auto-accepted (not audio or error)'
                  );
                }

                outputData = {
                  ...outputData,
                  files: fileReceived
                    ? [
                        {
                          chatInfo: rcvResp.chatItem.chatInfo,
                          chatItem: rcvResp.chatItem.chatItem,
                          file: fileReceived,
                        },
                      ]
                    : [],
                };
                break;
              }
              case 'rcvFileComplete': {
                const rcvResp = resp as {
                  chatItem?: {
                    chatInfo?: T.ChatInfo;
                    chatItem?: T.ChatItem & {
                      file?: unknown;
                      fileId?: number;
                      filePath?: string;
                      fileName?: string;
                    };
                  };
                  rcvFileTransfer?: { fileId?: number; filePath?: string; fileName?: string };
                };
                const chatInfo = rcvResp.chatItem?.chatInfo;
                const chatItem = rcvResp.chatItem?.chatItem;
                // File can be at chatItem.file or chatItem has fileId/filePath directly
                const file =
                  chatItem?.file ??
                  (chatItem && 'fileId' in chatItem
                    ? {
                        fileId: chatItem.fileId,
                        filePath: chatItem.filePath,
                        fileName: chatItem.fileName,
                      }
                    : null) ??
                  rcvResp.rcvFileTransfer ??
                  null;

                if (file && chatInfo) {
                  outputData = {
                    ...outputData,
                    files: [
                      {
                        chatInfo,
                        chatItem: chatItem ?? ({} as T.ChatItem),
                        file: file as T.CIFile,
                      },
                    ],
                  };
                  console.debug(
                    `[SimpleXity] rcvFileComplete: ${(file as { fileName?: string }).fileName ?? (file as { filePath?: string }).filePath ?? 'received'}`
                  );
                } else {
                  console.debug(
                    '[SimpleXity] rcvFileComplete: no file/chatInfo, keys=',
                    Object.keys(rcvResp),
                    chatItem ? Object.keys(chatItem) : 'no chatItem'
                  );
                }
                break;
              }
            }

            this.emit([[{ json: outputData }]]);
          } catch (error) {
            console.error('Error processing SimpleX message:', error);
            // Continue processing other messages even if one fails
          }
        }
      } catch (error) {
        console.error('Error in message processing loop:', error);
        isConnected = false;
      }
    };

    // Initial connection
    try {
      chat = await connect();
      // Start processing messages
      processIncomingMessages();
    } catch (error) {
      console.error('Failed to initialize SimpleX connection:', error);
      throw error;
    }

    // Return trigger response
    return {
      closeFunction: async () => {
        shouldStop = true;
        isConnected = false;

        if (chat) {
          try {
            // The connection will be cleaned up when the process ends
            await chat.disconnect();
            console.log('SimpleXity Trigger stopped');
          } catch (error) {
            console.error('Error closing SimpleX connection:', error);
          }
        }
      },
    };
  }
}
