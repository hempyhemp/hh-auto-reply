import bot from '@bot'

export const MAIN_MARKUP = {
  inline_keyboard: [
    [{ text: '🚀 Откликнуться сейчас', callback_data: 'hh_apply' }],
    [
      { text: '🔍 Изменить запрос', callback_data: 'hh_query' },
      { text: '🔢 Макс откликов', callback_data: 'hh_max' },
    ],
    [
      { text: '⏰ Авто вкл', callback_data: 'hh_auto_start' },
      { text: '⛔ Авто выкл', callback_data: 'hh_auto_stop' },
    ],
    [
      { text: '🔑 Логин', callback_data: 'hh_login' },
      { text: '⚙️ Статус', callback_data: 'hh_status' },
    ],
    [
      { text: '📄 Выбрать резюме', callback_data: 'hh_resume_list' },
      { text: '📋 Моё резюме', callback_data: 'hh_my_resume' },
    ],
    [{ text: '🚫 Проблемные вакансии', callback_data: 'hh_skipped' }],
  ],
}

export const LOGIN_MARKUP = {
  inline_keyboard: [
    [{ text: '🔑 Войти через hh.ru', callback_data: 'hh_login' }],
  ],
}

export const BACK_MARKUP = {
  inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'hh_back' }]],
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function safeEdit(
  text: string,
  options: Parameters<typeof bot.editMessageText>[1],
): Promise<void> {
  await bot.editMessageText(text, options).catch((e: unknown) => {
    if (e instanceof Error && e.message.includes('message is not modified'))
      return
    throw e
  })
}

export async function showResult(chatId: number, messageId: number, text: string): Promise<void> {
  await safeEdit(text, {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: BACK_MARKUP,
  })
}

export interface StatusReporter {
  status: (text: string) => Promise<void>
  keep: (text: string) => Promise<void>
  clear: () => Promise<void>
}

export function createStatusReporter(chatId: number, initialMsgId?: number | null): StatusReporter {
  let msgId: number | null = initialMsgId ?? null

  async function deleteCurrent(): Promise<void> {
    if (msgId) {
      await bot.deleteMessage(chatId, msgId).catch(() => {})
      msgId = null
    }
  }

  return {
    async status(text): Promise<void> {
      await deleteCurrent()
      const msg = await bot.sendMessage(chatId, text)
      msgId = msg.message_id
    },
    async keep(text): Promise<void> {
      await deleteCurrent()
      await bot.sendMessage(chatId, text, { parse_mode: 'HTML' })
    },
    async clear(): Promise<void> {
      await deleteCurrent()
    },
  }
}
