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
            name: 'File Received',
            value: 'rcvFileComplete',
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

            // Debug: log raw response structure (helps diagnose audio/voice messages)
            console.debug(`[SimpleXity] Received: type=${resp.type}`, {
              chatItemsCount: 'chatItems' in resp ? resp.chatItems?.length : undefined,
              chatItem: 'chatItem' in resp ? { contentType: (resp as { chatItem?: { chatItem?: { content?: { type?: string } } } }).chatItem?.chatItem?.content?.type } : undefined,
            });

            // Check if this message type should trigger
            if (!messageTypes.includes(resp.type)) {
              console.debug(`Skipping message type: ${resp.type}`);
              continue;
            }

            let outputData: SimplexityTriggerOutput = {
              messageType: resp.type,
              timestamp: new Date().toISOString(),
            };

            const respType = resp.type as string;
            switch (respType) {
              // case 'contactConnected': {
              //   const { contact } = resp;
              //   outputData = {
              //     ...outputData,
              //     contact: contact,
              //   };
              //   break;
              // }
              case 'newChatItems': {
                const messages: SimplexityTriggerOutput['messages'] = [];
                const chatItems = (resp as { chatItems?: Array<{ chatInfo: T.ChatInfo; chatItem: T.ChatItem }> }).chatItems ?? [];
                console.debug(`[SimpleXity] newChatItems: ${chatItems.length} items`);

                for (const { chatInfo, chatItem } of chatItems) {
                  // Only process direct messages
                  if (chatInfo.type !== 'direct') {
                    console.debug(`Skipping non-direct chat: ${chatInfo.type}`);
                    continue;
                  }

                  // rcvFileInvitation: file/voice offer (file not yet received)
                  if ((chatItem.content as { type: string }).type === 'rcvFileInvitation') {
                    const rcvFile = (chatItem.content as { rcvFileTransfer?: { fileId?: number } }).rcvFileTransfer;
                    messages.push({
                      chatInfo,
                      chatItem,
                      message: `[File/voice invitation] fileId=${rcvFile?.fileId ?? '?'}`,
                    });
                    console.debug(`[SimpleXity] Added rcvFileInvitation, fileId=${rcvFile?.fileId}`);
                    continue;
                  }

                  if (chatItem.content.type !== 'rcvMsgContent') {
                    console.debug(`[SimpleXity] Skipping content type: ${chatItem.content.type} (not rcvMsgContent)`);
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
                    const label = contentType === 'voice' ? '[Voice message]' : `[${contentType} message]`;
                    messages.push({
                      chatInfo,
                      chatItem,
                      message: text || label,
                    });
                    console.debug(`[SimpleXity] Added ${contentType} message, text="${text || '(empty)'}"`);
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
                const rcvResp = resp as { chatItem: { chatInfo: T.ChatInfo; chatItem: T.ChatItem & { file?: { fileId: number; fileName?: string } } } };
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
                  console.debug('[SimpleXity] rcvFileAccepted: file not auto-accepted (not audio or error)');
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
                const rcvResp = resp as { chatItem: { chatInfo: T.ChatInfo; chatItem: T.ChatItem & { file?: T.CIFile } } };
                const file = rcvResp.chatItem.chatItem.file;

                if (file) {
                  outputData = {
                    ...outputData,
                    files: [
                      {
                        chatInfo: rcvResp.chatItem.chatInfo,
                        chatItem: rcvResp.chatItem.chatItem,
                        file,
                      },
                    ],
                  };
                  console.debug(`[SimpleXity] rcvFileComplete: ${(file as { fileName?: string }).fileName ?? 'unknown'}`);
                } else {
                  console.debug('[SimpleXity] rcvFileComplete: no file in chatItem');
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
