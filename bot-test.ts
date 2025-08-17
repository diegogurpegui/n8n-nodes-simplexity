/**
 * This is a test file to test the simplex-chat library.
 * It is not part of the n8n-nodes-simplexity package.
 * It is used to test the library and to ensure that it is working correctly.
 */

import { ChatClient } from 'simplex-chat';
import { ChatType } from 'simplex-chat/dist/command';
import { ciContentText, ChatInfoType, ChatResponse } from 'simplex-chat/dist/response';
import { logger } from './logger';

const config = {
  port: process.env.SRV_PORT || 5225,
  host: process.env.SRV_HOST || 'localhost',
  address: process.env.BOT_ADDRESS,
};

async function processMessages(chat: ChatClient) {
  logger.info('Processing messages...');
  for await (const response of chat.msgQ) {
    try {
      const resp = (response instanceof Promise ? await response : response) as ChatResponse;
      logger.debug(`Received message: ${resp.type}`);
      switch (resp.type) {
        case 'contactConnected': {
          // sends welcome message when the new contact is connected
          const { contact } = resp;
          logger.info(`${contact.profile.displayName} connected`);
          await chat.apiSendTextMessage(
            ChatType.Direct,
            contact.contactId,
            'Hello! I am a simple squaring bot - if you send me a number, I will calculate its square'
          );
          break;
        }
        case 'newChatItems': {
          // calculates the square of the number and sends the reply
          for (const { chatInfo, chatItem } of resp.chatItems) {
            if (chatInfo.type !== ChatInfoType.Direct) continue;
            const msg = ciContentText(chatItem.content);
            if (msg) {
              const n = +msg;
              const reply =
                typeof n === 'number' && !isNaN(n)
                  ? `${n} * ${n} = ${n * n}`
                  : `this is not a number`;
              await chat.apiSendTextMessage(ChatType.Direct, chatInfo.contact.contactId, reply);
            }
          }
          break;
        }
        case 'rcvFileComplete': {
          logger.info(`Received file complete.`);
          const fileId = (resp.chatItem.chatItem as any).file.fileId as number;
          // custom call to receive file
          const file = await chat.sendChatCommand({ type: 'receiveFile', fileId });
          logger.info(`File:`, file);
          break;
        }
        default: {
          logger.info(`Unsupported message type: ${resp.type}`);
        }
      }
    } catch (error) {
      logger.error(`Error processing message:\n${JSON.stringify(error)}`);
    }
  }
}

async function run() {
  try {
    logger.info(`Starting bot connection to ${config.host}:${config.port}...`);

    const chat = await ChatClient.create(`ws://${config.host}:${config.port}`, {
      qSize: 16,
      tcpTimeout: 10_000,
    });
    // this example assumes that you have initialized user profile for chat bot via terminal CLI
    const user = await chat.apiGetActiveUser();
    if (!user) {
      logger.warn('no user profile');
      return;
    }
    logger.info(`Bot profile: ${user.profile.displayName} (${user.profile.fullName})`);
    // creates or uses the existing long-term address for the bot
    let address = config.address || (await chat.apiGetUserAddress());
    if (!address) {
      logger.debug(`No address found (${address}), creating new one...`);
      address = await chat.apiCreateUserAddress();
    }

    logger.info(`Bot address: ${address}`);

    // enables automatic acceptance of contact connections
    await chat.enableAddressAutoAccept();

    // start processing messages
    await processMessages(chat);
  } catch (error) {
    logger.error('Error running bot', JSON.stringify(error));
  }
}

run();
