import bot from '@bot'

export const BTN = {
  APPLY: '🚀 Откликнуться',
  STATUS: '⚙️ Статус',
  QUERY: '🔍 Изменить запрос',
  MAX: '🔢 Макс. откликов',
  AUTO_TOGGLE: '⏰ Авто',
  LOGIN: '🔑 Войти на hh.ru',
  RESUME_LIST: '📄 Выбрать резюме',
  MY_RESUME: '📋 Моё резюме',
  SKIPPED: '🚫 Проблемные вакансии',
  SETTINGS: '⚙️ Настройки',
  INFO: 'ℹ️ Информация',
  BACK: '◀️ Назад',
  PROMPT: '📝 Промт',
} as const

export const LOGIN_REPLY_KEYBOARD = {
  keyboard: [[{ text: BTN.LOGIN }]],
  resize_keyboard: true,
  persistent: true,
}

export const MAIN_REPLY_KEYBOARD = {
  keyboard: [
    [{ text: BTN.APPLY }],
    [{ text: BTN.SETTINGS }, { text: BTN.INFO }],
  ],
  resize_keyboard: true,
  persistent: true,
}

export const SETTINGS_REPLY_KEYBOARD = {
  keyboard: [
    [{ text: BTN.MAX }, { text: BTN.QUERY }],
    [{ text: BTN.AUTO_TOGGLE }, { text: BTN.RESUME_LIST }],
    [{ text: BTN.PROMPT }, { text: BTN.LOGIN }],
    [{ text: BTN.BACK }],
  ],
  resize_keyboard: true,
  persistent: true,
}

export const INFO_REPLY_KEYBOARD = {
  keyboard: [
    [{ text: BTN.STATUS }, { text: BTN.MY_RESUME }],
    [{ text: BTN.SKIPPED }],
    [{ text: BTN.BACK }],
  ],
  resize_keyboard: true,
  persistent: true,
}

export const APPLYING_REPLY_KEYBOARD = {
  keyboard: [[{ text: '⏳ Откликаюсь на вакансии...' }]],
  resize_keyboard: true,
  persistent: true,
}

export const BACK_MARKUP = {
  inline_keyboard: [[{ text: '◀️ Назад', callback_data: 'hh_back' }]],
}

export const NO_RESUME_MARKUP = {
  inline_keyboard: [[
    { text: '🔄 Повторить', callback_data: 'hh_resume_list' },
    { text: '🔑 Другой аккаунт', callback_data: 'hh_login' },
  ]],
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function safeEdit(
  text: string,
  options: Parameters<typeof bot.editMessageText>[1],
): Promise<void> {
  await bot.editMessageText(text, options).catch((e: unknown) => {
    if (e instanceof Error && (
      e.message.includes('message is not modified')
      || e.message.includes('message to edit not found')
    )) {
      return
    }
    throw e
  })
}

export interface StatusReporter {
  status: (text: string) => Promise<void>
  keep: (text: string) => Promise<void>
  clear: () => Promise<void>
}

export function createStatusReporter(chatId: number): StatusReporter {
  let msgId: number | null = null

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
