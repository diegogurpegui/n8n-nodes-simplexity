# SimpleXity (a SimpleX Chat n8n Node)

This project provides a n8n node for integrating with SimpleX Chat, allowing you to trigger workflows on incoming messages and send messages to contacts.

## Features

- **SimpleXity Trigger Node**: Listens for incoming SimpleX messages and triggers workflows
- **SimpleXity Action Node**: Sends messages to SimpleX contacts
- **Credential Management**: Secure storage of SimpleX connection settings

## Requirements

A SimpleX Chat CLI should be running.  
For more information: https://github.com/simplex-chat/simplex-chat/blob/stable/docs/CLI.md

## Installation

You can follow the standard installation guide for n8n nodes.

Steps for installing locally:

1. Clone this repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Copy the `dist` folder to your n8n custom nodes directory

## Configuration

### Credentials

Create a SimpleX configuration credential to connect to the SimpleX CLI.  
You can setup the following fields:

- **Host**: SimpleX Client host (default: localhost)
- **Port**: SimpleX Client port (default: 5225)
- **Bot Address**: Optional SimpleX bot address (will be created if not provided)

### Node Operations

#### SimpleXity Trigger Node

The SimpleXity Trigger node listens for incoming SimpleX messages and can be configured to trigger on:

- **Text Messages**: New chat items with text content
- **Contact Connected**: When a new contact connects
- **File Received**: When a file is received

#### SimpleXity Action Node

The SimpleXity Action node allows you to send messages to SimpleX contacts:

- **Contact ID**: The numeric ID of the contact to send the message to
- **Message**: The text message to send

## Usage Examples

### Trigger Workflow

1. Add a SimpleXity Trigger node to your workflow
2. Configure the credential with your SimpleX server details
3. Select the message types you want to trigger on
4. The node will emit data when messages are received

### Send Message Workflow

1. Add a SimpleXity Action node to your workflow
2. Configure the credential with your SimpleX server details
3. Provide the contact ID and message
4. The node will send the message and return success/error status

## Data Structure

### Trigger Output

The SimpleXity Trigger node outputs data in the following format:

```json
{
  "messageType": "newChatItems",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "event": "new_messages",
  "messages": [
    {
      "contactId": 123,
      "contactName": "John Doe",
      "message": "Hello!",
      "messageId": 456
    }
  ]
}
```

### Action Output

The SimpleXity Action node returns:

```json
{
  "success": true,
  "contactId": 123,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Development

### Project Structure

```
├── credentials/
│   └── SimpleXity.credentials.ts        # Credential definition
├── nodes/
│   └── SimpleX/
│       ├── SimpleXityTrigger.node.ts    # Trigger node implementation
│       ├── SimpleXitySendAction.node.ts # Action node implementation
│       └── simplexity.svg               # Node icon
├── package.json                         # Project dependencies
├── tsconfig.json                        # TypeScript configuration
├── n8n-index.ts                         # n8n node/credential export
└── gulpfile.js                          # Build configuration
```

### Building

```bash
npm run build
```

### Development Mode

```bash
npm run dev
```

## Prerequisites

- n8n instance
- SimpleX Chat server running
- Node.js 16+ and npm

## License

MIT

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Support

For issues and questions, please open an issue on GitHub.
