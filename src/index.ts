import bot from '@bot'

import prisma from '@prisma'

process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason)
  console.error('[unhandledRejection]', msg)
})
import { registerHHCommands, triggerHHStart } from './hh/bot-commands.js'

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

console.log('Bot started 🚀')
