import {
  IDataObject,
  INodeType,
  INodeTypeDescription,
  ITriggerFunctions,
  ITriggerResponse,
  NodeConnectionType,
} from 'n8n-workflow';
import { ChatClient } from 'simplex-chat';
import {
  ciContentText,
  ChatInfoType,
  ChatResponse,
  ChatInfo,
  Contact,
  ChatItem,
  CIMeta,
} from 'simplex-chat/dist/response';
import { SimpleXFile } from '../../types/simplex';

interface SimpleXityTriggerOutput extends IDataObject {
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
}

export class SimpleXityTrigger implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'SimpleXity Trigger',
    name: 'simplexityTrigger',
    icon: 'file:simplexity.svg',
    group: ['trigger'],
    version: 1,
    subtitle: 'Triggers when a new message is received',
    description: 'Triggers workflows when SimpleX messages are received',
    defaults: {
      name: 'SimpleXity Trigger',
    },
    inputs: [] as any,
    outputs: [NodeConnectionType.Main],
    credentials: [
      {
        name: 'simplexityConfig',
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
    const credentials = await this.getCredentials('simplexityConfig');
    const messageTypes = this.getNodeParameter('messageTypes', []) as string[];

    const chat = await ChatClient.create(`ws://${credentials.host}:${credentials.port}`);

    // Get or create bot address
    let address = credentials.botAddress || (await chat.apiGetUserAddress());
    if (!address) {
      address = await chat.apiCreateUserAddress();
    }

    // Enable automatic acceptance of contact connections
    await chat.enableAddressAutoAccept();

    const processIncomingMessages = async () => {
      for await (const response of chat.msgQ) {
        try {
          const resp = (response instanceof Promise ? await response : response) as ChatResponse;

          // Check if this message type should trigger
          if (!messageTypes.includes(resp.type)) {
            continue;
          }

          let outputData: SimpleXityTriggerOutput = {
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
              const messages: SimpleXityTriggerOutput['messages'] = [];
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
        }
      }
    };

    // Start processing messages
    processIncomingMessages();

    // Return trigger response
    return {
      closeFunction: async () => {
        // Cleanup when trigger is stopped
        if (chat) {
          // Close the chat connection
          // Note: ChatClient doesn't have a direct close method, but we can stop processing
        }
      },
    };
  }
}
