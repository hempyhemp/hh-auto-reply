import bot from '@bot'
import { triggerHHStart } from '@/hh/bot-commands'
import { askLLM } from '@/openai'

export function sendMenu(chatId: number, isFirstTime: boolean) {
  const text = isFirstTime
    ? '👋 Добро пожаловать! Это твой первый вход'
    : '💼 Главное меню'

  return bot.sendMessage(chatId, text, {
    reply_markup: {
      keyboard: [
        [{ text: '💼 Меню' }],
        [{ text: '👤 Debug' }],
      ],
      resize_keyboard: true,
      one_time_keyboard: false,
      is_persistent: true,
    },
  })
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id
  const text = msg.text

  if (!text || text.startsWith('/'))
    return

  switch (text) {
    case '💼 Меню':

      triggerHHStart(chatId)
      break

    case '👤 Debug': {
      askLLM('Привет, как дела?')
      // const resume = await getResume(chatId)
      //
      // await bot.sendMessage(chatId, resume || '--')

      // const letter = await askGPT('test')
      //
      // const user = await prisma.user.findUnique({
      //   where: { telegramId: BigInt(chatId) },
      // })
      //
      // await bot.sendMessage(
      //   chatId,
      //   `👤:\n\n
      //   Username: @${user?.username ?? 'нет'}\n
      //   Письмо: ${letter}\n
      //   HH Email: ${user?.hhEmail}\n
      //   Создан: ${user?.createdAt}
      //
      //   `,
      // )
      // break
    }
  }
})
