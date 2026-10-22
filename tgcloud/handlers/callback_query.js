import { api } from 'sdk';
import * as repo from '../lib/repo.js';
import { createBot } from '../lib/bot.js';

const bot = createBot({ api, repo });

export default async function (callbackQuery) {
  await bot.handleCallback(callbackQuery);
}
