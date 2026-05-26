import bot from '@bot'
import { triggerHHStart } from '@/hh/bot-commands'

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/'))
    return

  if (msg.text === '💼 Меню') {
    await triggerHHStart(msg.chat.id)
  }
})
