import {
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IExecuteFunctions,
  NodeConnectionType,
} from 'n8n-workflow';
import { ChatClient } from 'simplex-chat';
import { ChatType } from 'simplex-chat/dist/command';

export class Simplexity implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'SimpleXity',
    name: 'simplexity',
    icon: 'file:simplexity.svg',
    group: ['action'],
    version: 1,
    subtitle: 'Send a message to a contact',
    description: 'Send messages to SimpleX contact',
    defaults: {
      name: 'Simplexity',
    },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [
      {
        name: 'simplexityApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Contact ID',
        name: 'contactId',
        type: 'number',
        default: 0,
        description: 'The contact ID to send the message to',
        required: true,
      },
      {
        displayName: 'Message',
        name: 'message',
        type: 'string',
        default: '',
        description: 'The message to send',
        required: true,
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    const credentials = await this.getCredentials('simplexityApi');
    const chat = await ChatClient.create(`ws://${credentials.host}:${credentials.port}`);

    for (let i = 0; i < items.length; i++) {
      try {
        const contactId = this.getNodeParameter('contactId', i) as number;
        const message = this.getNodeParameter('message', i) as string;

        const resultItems = await chat.apiSendTextMessage(ChatType.Direct, contactId, message);

        returnData.push({
          json: {
            success: true,
            contactId,
            result: resultItems.map((item) => ({
              infoType: item.chatInfo.type,
              itemChatDir: item.chatItem.chatDir,
            })),
            timestamp: new Date().toISOString(),
          },
        });
      } catch (error) {
        returnData.push({
          json: {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }

    return [returnData];
  }
}
