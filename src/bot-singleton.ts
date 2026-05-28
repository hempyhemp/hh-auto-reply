import process from 'node:process'

import TelegramBot from 'node-telegram-bot-api'

const token = process.env.TG_BOT_TOKEN!
const bot = new TelegramBot(token, { polling: true })

bot.on('polling_error', (err: any) => {
  // EFATAL (socket hang up) — Telegram обрывает long-poll соединение, это нормально
  if (err?.code === 'EFATAL') return
  console.error('[polling_error]', err?.code, err?.message)
})

export default bot
