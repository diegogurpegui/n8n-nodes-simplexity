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
    },
    {
      displayName: 'File Base Path',
      name: 'fileBasePath',
      type: 'string',
      default: '/home/node/.n8n/temp',
      description:
        'Path to SimpleX profile directory where received files are stored. Used when files are on the same filesystem (e.g. shared volume).',
    },
    {
      displayName: 'File Server Port',
      name: 'fileServerPort',
      type: 'number',
      default: 8090,
      description:
        'Port for the HTTP file server (same host as WebSocket). When set, the trigger fetches received files over HTTP when they are not on the local filesystem. Set to 0 to disable.',
    },
  ];
}
