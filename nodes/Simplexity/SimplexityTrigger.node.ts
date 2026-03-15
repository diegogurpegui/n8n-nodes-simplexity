import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
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
    version: 2,
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
            name: 'File Received',
            value: 'rcvFileComplete',
          },
          {
            name: 'File Transfer Started',
            value: 'rcvFileStart',
          },
          {
            name: 'Message Deleted',
            value: 'chatItemDeleted',
          },
          {
            name: 'Message Updated',
            value: 'chatItemUpdated',
          },
          {
            name: 'Text Messages',
            value: 'newChatItems',
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

            // Debug: log every incoming message (use log so it shows without debug level)
            if (
              respType === 'newChatItems' ||
              respType === 'rcvFileAccepted' ||
              respType === 'rcvFileComplete' ||
              respType === 'rcvFileStart'
            ) {
              console.log(
                `[SimpleXity] IN: type=${respType}`,
                JSON.stringify(resp, null, 2).slice(0, 1500)
              );
            }

            // Note: apiReceiveFile must be called on rcvFileInvitation (in newChatItems), not on rcvFileAccepted.
            // The rcvFileAccepted event is a notification; calling apiReceiveFile here causes "error receiving file".

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
                  if (chatInfo.type !== 'direct') {
                    console.debug(`Skipping non-direct chat: ${chatInfo.type}`);
                    continue;
                  }

                  const contentWrapperType = (chatItem.content as { type: string }).type;
                  if (contentWrapperType === 'rcvFileInvitation') {
                    const rcvFile = (
                      chatItem.content as {
                        rcvFileTransfer?: { fileId?: number; fileName?: string };
                      }
                    ).rcvFileTransfer;
                    const fileId = rcvFile?.fileId;
                    const fileName = rcvFile?.fileName ?? '';
                    const fullContent = JSON.stringify(chatItem.content);
                    console.log(
                      `[SimpleXity] rcvFileInvitation: fileId=${fileId}, fileName="${fileName}", isAudio=${isAudioFile(fileName)}, contentKeys=${Object.keys(chatItem.content as object).join(',')}`
                    );
                    console.log(
                      `[SimpleXity] rcvFileInvitation full content: ${fullContent.slice(0, 500)}`
                    );
                    messages.push({
                      chatInfo,
                      chatItem,
                      message: `[File/voice invitation] fileId=${fileId ?? '?'}`,
                    });
                    // Accept audio files immediately; apiReceiveFile must be called on invitation, not rcvFileAccepted.
                    // Also accept when fileName is empty (voice messages may not include extension).
                    const shouldAccept =
                      fileId !== undefined && chat && (isAudioFile(fileName) || !fileName);
                    if (shouldAccept) {
                      try {
                        console.log(
                          `[SimpleXity] Calling apiReceiveFile(fileId=${fileId}) from rcvFileInvitation, fileName="${fileName}"`
                        );
                        await chat.apiReceiveFile(fileId);
                        console.log(`[SimpleXity] apiReceiveFile OK for fileId=${fileId}`);
                      } catch (err) {
                        const errObj = err as { response?: unknown };
                        console.error(
                          '[SimpleXity] apiReceiveFile FAILED from rcvFileInvitation:',
                          err instanceof Error ? err.message : err
                        );
                        console.error(
                          '[SimpleXity] apiReceiveFile error response:',
                          JSON.stringify(errObj.response)
                        );
                      }
                    } else if (fileId !== undefined && fileName && !isAudioFile(fileName)) {
                      console.log(
                        `[SimpleXity] Skipping apiReceiveFile: fileName="${fileName}" not audio`
                      );
                    }
                    continue;
                  }
                  if (contentWrapperType !== 'rcvMsgContent') {
                    console.debug(
                      `[SimpleXity] Skipping content type: ${contentWrapperType} (not rcvMsgContent)`
                    );
                    continue;
                  }

                  const msgContent = (chatItem.content as T.CIContent.RcvMsgContent).msgContent;
                  const contentType = (msgContent?.type ?? 'unknown') as string;
                  const text = msgContent?.text ?? '';

                  switch (contentType) {
                    case 'text':
                    case 'link':
                      if (text) messages.push({ chatInfo, chatItem, message: text });
                      break;
                    case 'voice':
                    case 'file':
                    case 'image':
                    case 'video': {
                      const label =
                        contentType === 'voice' ? '[Voice message]' : `[${contentType} message]`;
                      messages.push({ chatInfo, chatItem, message: text || label });
                      // Voice/file/image/video can have chatItem.file with rcvInvitation - call apiReceiveFile to accept
                      // Voice messages: SimpleX auto-accepts inline transfers; calling ReceiveFile yields fileAlreadyReceiving.
                      const file = (
                        chatItem as {
                          file?: {
                            fileId?: number;
                            fileName?: string;
                            fileStatus?: { type?: string };
                          };
                        }
                      ).file;
                      if (
                        file?.fileId !== undefined &&
                        file?.fileStatus?.type === 'rcvInvitation' &&
                        chat &&
                        contentType !== 'voice'
                      ) {
                        try {
                          await chat.apiReceiveFile(file.fileId);
                          console.log(`[SimpleXity] apiReceiveFile OK for fileId=${file.fileId}`);
                        } catch (err) {
                          const errResp = (err as { response?: unknown })?.response;
                          console.error(
                            '[SimpleXity] apiReceiveFile FAILED:',
                            err instanceof Error ? err.message : err
                          );
                          if (errResp) {
                            console.error('[SimpleXity] Server response:', JSON.stringify(errResp));
                          }
                        }
                      }
                      console.debug(
                        `[SimpleXity] Added ${contentType} message, text="${text || '(empty)'}"`
                      );
                      break;
                    }
                    default:
                      if (contentType !== 'unknown') {
                        messages.push({
                          chatInfo,
                          chatItem,
                          message: text || `[${contentType} message]`,
                        });
                      }
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
                  chatItem?: {
                    chatInfo?: T.ChatInfo;
                    chatItem?: T.ChatItem & {
                      file?: T.CIFile | { fileId: number; fileName?: string };
                    };
                  };
                };
                console.log(
                  '[SimpleXity] rcvFileAccepted handler: NOT calling apiReceiveFile (would fail). Structure:',
                  JSON.stringify({
                    hasChatItem: !!rcvResp.chatItem,
                    hasChatInfo: !!rcvResp.chatItem?.chatInfo,
                    hasFile: !!rcvResp.chatItem?.chatItem?.file,
                    keys: Object.keys(rcvResp),
                    chatItemKeys: rcvResp.chatItem ? Object.keys(rcvResp.chatItem) : [],
                  })
                );
                console.log(
                  '[SimpleXity] rcvFileAccepted full resp:',
                  JSON.stringify(rcvResp).slice(0, 800)
                );
                const chatItemWrapper = rcvResp.chatItem;
                const file = chatItemWrapper?.chatItem?.file;
                if (file && chatItemWrapper?.chatInfo) {
                  outputData.files = [
                    {
                      chatInfo: chatItemWrapper.chatInfo,
                      chatItem: chatItemWrapper.chatItem as T.ChatItem,
                      file: file as T.CIFile,
                    },
                  ];
                  console.log(
                    `[SimpleXity] rcvFileAccepted: emitting file ${(file as { fileName?: string }).fileName ?? (file as { fileId?: number }).fileId}`
                  );
                } else {
                  console.log(
                    '[SimpleXity] rcvFileAccepted: no file/chatInfo in event, emitting with files=[]'
                  );
                }
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
                console.log(
                  '[SimpleXity] rcvFileComplete: keys=',
                  Object.keys(rcvResp),
                  'chatItemKeys=',
                  rcvResp.chatItem ? Object.keys(rcvResp.chatItem) : 'none',
                  'chatItem.chatItemKeys=',
                  rcvResp.chatItem?.chatItem
                    ? Object.keys(rcvResp.chatItem.chatItem as object)
                    : 'none'
                );
                console.log(
                  '[SimpleXity] rcvFileComplete full:',
                  JSON.stringify(rcvResp).slice(0, 1000)
                );
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
                  console.log(
                    `[SimpleXity] rcvFileComplete: emitting file ${(file as { fileName?: string }).fileName ?? (file as { filePath?: string }).filePath ?? 'received'}`
                  );
                } else {
                  console.log(
                    '[SimpleXity] rcvFileComplete: no file/chatInfo, emitting with files=[]'
                  );
                }
                break;
              }
            }

            // Add binary for files when filePath is available and fileBasePath is configured
            let emitPayload: Array<{
              json: SimplexityTriggerOutput;
              binary?: Record<string, unknown>;
            }> = [{ json: outputData }];
            const fileBasePath = (credentials as { fileBasePath?: string }).fileBasePath?.trim();
            const firstFile = outputData.files?.[0];
            const filePath = firstFile?.file
              ? (firstFile.file as { filePath?: string }).filePath
              : undefined;
            const fileName =
              firstFile?.file && 'fileName' in firstFile.file
                ? (firstFile.file as { fileName?: string }).fileName
                : 'file';
            if (filePath && fileBasePath) {
              try {
                const absPath = filePath.startsWith('/') ? filePath : join(fileBasePath, filePath);
                const buffer = await readFile(absPath);
                const binaryData = await this.helpers.prepareBinaryData(buffer, fileName || 'file');
                emitPayload = [{ json: outputData, binary: { data: binaryData } }];
                console.log(`[SimpleXity] Added binary for ${fileName} from ${absPath}`);
              } catch (err) {
                console.warn(
                  `[SimpleXity] Could not read file for binary output: ${err instanceof Error ? err.message : err}`
                );
              }
            }

            this.emit([emitPayload as never]);
          } catch (error) {
            const err = error as {
              response?: { type?: string; chatError?: unknown };
              message?: string;
            };
            console.error('[SimpleXity] Error processing message:', err?.message ?? error);
            console.error(
              '[SimpleXity] Full error:',
              JSON.stringify(err, Object.getOwnPropertyNames(err))
            );
            if (err?.response) {
              console.error('[SimpleXity] Error response:', JSON.stringify(err.response));
              if (err.response.chatError) {
                console.error('[SimpleXity] chatError:', JSON.stringify(err.response.chatError));
              }
            }
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
