import process from 'node:process'

import TelegramBot from 'node-telegram-bot-api'

const token = process.env.TG_BOT_TOKEN!
const bot = new TelegramBot(token, { polling: true })

export default bot
