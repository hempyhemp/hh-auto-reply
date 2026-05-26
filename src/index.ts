import bot from '@bot'
import prisma from '@prisma'

import { sendMenu } from './bot-menu'
import { registerHHCommands } from './hh/bot-commands.js'

registerHHCommands()

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id
  const telegramId = BigInt(chatId)

  const existingUser = await prisma.user.findUnique({
    where: { telegramId },
  })

  const isFirstTime = !existingUser

  await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: msg.from?.username ?? null,
    },
    create: {
      telegramId,
      username: msg.from?.username ?? null,
      firstName: msg.from?.first_name ?? null,
      Settings: { create: {} },
    },
  })

  await sendMenu(chatId, isFirstTime)
})

console.log('Bot started 🚀')
