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
    message: string;
    meta: T.CIMeta;
  }>;
  files?: Array<{
    chatInfo: T.ChatInfo;
    file: T.CIFile;
    meta: T.CIMeta;
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
        await chatClient.enableAddressAutoAccept(activeUser.userId);

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

            // Check if this message type should trigger
            if (!messageTypes.includes(resp.type)) {
              console.debug(`Skipping message type: ${resp.type}`);
              continue;
            }

            let outputData: SimplexityTriggerOutput = {
              messageType: resp.type,
              timestamp: new Date().toISOString(),
            };

            switch (resp.type) {
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
                for (const { chatInfo, chatItem } of resp.chatItems) {
                  // Only process direct messages
                  if (chatInfo.type !== 'direct') {
                    console.debug(`Skipping message type: ${chatInfo.type}`);
                    continue;
                  }

                  // const msg = ciContentText(chatItem.content as T.CIContent.RcvMsgContent);
                  if (chatItem.content.type !== 'rcvMsgContent') {
                    console.error('Invalid message content type:', chatItem.content.type);
                    continue;
                  }
                  const msg = (chatItem.content as T.CIContent.RcvMsgContent).msgContent.text;
                  if (msg) {
                    messages.push({
                      chatInfo: chatInfo,
                      meta: chatItem.meta,
                      message: msg,
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
                const file = resp.chatItem.chatItem.file;

                if (!file) {
                  console.error('No file in "rcvFileAccepted" message');
                  break;
                }

                // Accept audio files automatically
                let fileReceived: T.CIFile | undefined = undefined;
                if (isAudioFile(file.fileName) && chat) {
                  try {
                    const fileChatItem = await chat.apiReceiveFile(file.fileId);
                    fileReceived = fileChatItem.chatItem.file;
                    console.debug('Audio file received:');
                  } catch (error) {
                    console.error('Error receiving audio file:', error);
                  }
                }

                if (!fileReceived) {
                  console.error('No file received in "rcvFileAccepted" message');
                }

                outputData = {
                  ...outputData,
                  files: fileReceived
                    ? [
                        {
                          chatInfo: resp.chatItem.chatInfo,
                          meta: resp.chatItem.chatItem.meta,
                          file: fileReceived,
                        },
                      ]
                    : [],
                };
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
