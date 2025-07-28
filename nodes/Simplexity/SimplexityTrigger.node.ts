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
import {
  ciContentText,
  ChatInfoType,
  ChatResponse,
  ChatInfo,
  ChatItem,
  CIMeta,
} from 'simplex-chat/dist/response';
import { SimpleXFile } from '../../types/simplex';

interface SimplexityTriggerOutput extends IDataObject {
  messageType: string;
  timestamp: string;
  messages?: Array<{
    chatInfo: ChatInfo;
    message: string;
    meta: CIMeta;
  }>;
  files?: Array<{
    chatInfo: ChatInfo;
    file: SimpleXFile;
    meta: CIMeta;
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

    const connect = async (): Promise<ChatClient> => {
      try {
        const chatClient = await ChatClient.create(`ws://${credentials.host}:${credentials.port}`);
        isConnected = true;

        // Get or create bot address
        let address = credentials.botAddress || (await chatClient.apiGetUserAddress());
        if (!address) {
          address = await chatClient.apiCreateUserAddress();
        }

        // Enable automatic acceptance of contact connections
        await chatClient.enableAddressAutoAccept();

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
      if (!chat) return;

      try {
        for await (const response of chat.msgQ) {
          // Check if we should stop processing
          if (shouldStop || !isConnected) {
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
              continue;
            }

            let outputData: SimplexityTriggerOutput = {
              messageType: resp.type,
              timestamp: new Date().toISOString(),
            };

            switch (resp.type) {
              case 'contactConnected': {
                const { contact } = resp;
                outputData = {
                  ...outputData,
                  contact: contact,
                };
                break;
              }
              case 'newChatItems': {
                const messages: SimplexityTriggerOutput['messages'] = [];
                for (const { chatInfo, chatItem } of resp.chatItems) {
                  // Only process direct messages
                  if (chatInfo.type !== ChatInfoType.Direct) continue;

                  const msg = ciContentText(chatItem.content);
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
              case 'rcvFileComplete': {
                const file = (resp.chatItem.chatItem as ChatItem & { file: SimpleXFile }).file;

                outputData = {
                  ...outputData,
                  files: [
                    {
                      chatInfo: resp.chatItem.chatInfo,
                      meta: resp.chatItem.chatItem.meta,
                      file: file,
                    },
                  ],
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
            // Note: ChatClient doesn't have a direct close method
            // The connection will be cleaned up when the process ends
            console.log('SimpleXity Trigger stopped');
          } catch (error) {
            console.error('Error closing SimpleX connection:', error);
          }
        }
      },
    };
  }
}
