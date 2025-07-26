import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class SimplexityApi implements ICredentialType {
  name = 'simplexityApi';
  displayName = 'SimpleXity Config API';
  description = 'Configuration to connect to the SimpleX local node.';
  documentationUrl = 'https://github.com/diegogurpegui/n8n-nodes-simplexity';
  properties: INodeProperties[] = [
    {
      displayName: 'Host',
      name: 'host',
      type: 'string',
      default: 'localhost',
      description: 'SimpleX CLI host for websocket connection',
      required: true,
    },
    {
      displayName: 'Port',
      name: 'port',
      type: 'number',
      default: 5225,
      description: 'SimpleX CLI port for websocket connection',
      required: true,
    },
    {
      displayName: 'Bot Address',
      name: 'botAddress',
      type: 'string',
      default: '',
      description: 'SimpleX CLI bot address (optional - will be created if not provided)',
      // required: false,
    },
  ];
}
