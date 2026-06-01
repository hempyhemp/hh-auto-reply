// import * as process from 'node:process'
import './globals.js'
import bot from '@bot'
import prisma from '@prisma'
import { registerHHCommands, triggerHHStart } from './hh/bot-commands.js'

const log = createLogger('index')

process.on('unhandledRejection', (reason) => {
  log.error('[unhandledRejection]', reason)
})
// console.log('hi') //PWDEBUG=1
registerHHCommands()

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  const telegramId = BigInt(chatId)

  const existingUser = await prisma.user.findUnique({ where: { telegramId } })

  await prisma.user.upsert({
    where: { telegramId },
    update: { username: msg.from?.username ?? null },
    create: {
      telegramId,
      username: msg.from?.username ?? null,
      firstName: msg.from?.first_name ?? null,
      Settings: { create: {} },
    },
  })

  if (!existingUser) {
    await bot.sendMessage(
      chatId,
      `👋 Привет, ${msg.from?.first_name ?? 'друг'}!\n\nЭто бот для авто-откликов на hh.ru.\nНачни с логина — нажми 🔑 Логин.`,
    )
  }

  await triggerHHStart(chatId)
})

log.ok('Bot started 🚀')
