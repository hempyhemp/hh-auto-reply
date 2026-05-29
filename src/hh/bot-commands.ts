import bot from '@bot'
import prisma from '@prisma'
import { BTN, FILTERS_REPLY_KEYBOARD, INFO_REPLY_KEYBOARD, LOGIN_REPLY_KEYBOARD, MAIN_REPLY_KEYBOARD, SETTINGS_REPLY_KEYBOARD } from './ui.js'
import { getState } from './state.js'
import { doLogin, handleLogin } from './handlers/auth.js'
import { handleApply } from './handlers/apply.js'
import { handleStatus, handleSkipped } from './handlers/info.js'
import { handleMyResume, handleResumeList, handleResumePick } from './handlers/resume.js'
import { handleAutoToggle, handleMax, handlePrompt, handleQuery } from './handlers/settings.js'

type MsgHandler = (chatId: number) => Promise<void>
type CallbackHandler = (chatId: number, messageId: number) => Promise<void>

const MESSAGE_HANDLERS: Partial<Record<string, MsgHandler>> = {
  [BTN.APPLY]: handleApply,
  [BTN.STATUS]: handleStatus,
  [BTN.QUERY]: handleQuery,
  [BTN.MAX]: handleMax,
  [BTN.AUTO_TOGGLE]: handleAutoToggle,
  [BTN.PROMPT]: handlePrompt,
  [BTN.LOGIN]: handleLogin,
  [BTN.RESUME_LIST]: handleResumeList,
  [BTN.MY_RESUME]: handleMyResume,
  [BTN.SKIPPED]: handleSkipped,
  [BTN.SETTINGS]: async chatId => { await bot.sendMessage(chatId, '⚙️ Настройки:', { reply_markup: SETTINGS_REPLY_KEYBOARD }) },
  [BTN.FILTERS]: async chatId => { await bot.sendMessage(chatId, '🔎 Фильтры:', { reply_markup: FILTERS_REPLY_KEYBOARD }) },
  [BTN.INFO]: async chatId => { await bot.sendMessage(chatId, 'ℹ️ Информация:', { reply_markup: INFO_REPLY_KEYBOARD }) },
  [BTN.BACK]: async chatId => { await bot.sendMessage(chatId, '🤖 HH Auto-Apply', { reply_markup: MAIN_REPLY_KEYBOARD }) },
}

const CALLBACK_HANDLERS: Record<string, CallbackHandler> = {
  hh_back: async (chatId, messageId) => {
    await bot.deleteMessage(chatId, messageId).catch(() => {})
  },
  hh_login: async (chatId, messageId) => {
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await handleLogin(chatId)
  },
  hh_login_use_current: async (chatId, messageId) => {
    const state = getState(chatId)
    state.awaitingEmail = false
    state.loginPromptMessageId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
    if (!user?.hhEmail) {
      await bot.sendMessage(chatId, '❌ Email не найден, введи вручную')
      state.awaitingEmail = true
      return
    }
    await doLogin(chatId, user.hhEmail)
  },
  hh_keep_query: async (chatId, messageId) => {
    const state = getState(chatId)
    state.awaitingQuery = false
    state.queryPromptMessageId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
  },
  hh_keep_max: async (chatId, messageId) => {
    const state = getState(chatId)
    state.awaitingMax = false
    state.maxPromptMessageId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
  },
  hh_keep_prompt: async (chatId, messageId) => {
    const state = getState(chatId)
    state.awaitingPrompt = false
    state.promptPromptMessageId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
  },
  hh_resume_list: async (chatId, messageId) => {
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await handleResumeList(chatId)
  },
}

async function clearAwaitingState(chatId: number): Promise<void> {
  const state = getState(chatId)
  const msgIds = [
    state.loginPromptMessageId,
    state.queryPromptMessageId,
    state.maxPromptMessageId,
    state.promptPromptMessageId,
  ]
  state.awaitingEmail = false
  state.awaitingQuery = false
  state.awaitingMax = false
  state.awaitingPrompt = false
  state.loginPromptMessageId = null
  state.queryPromptMessageId = null
  state.maxPromptMessageId = null
  state.promptPromptMessageId = null
  await Promise.all(msgIds.filter(Boolean).map(id => bot.deleteMessage(chatId, id!).catch(() => {})))
}

export async function triggerHHStart(chatId: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
  const keyboard = user?.session ? MAIN_REPLY_KEYBOARD : LOGIN_REPLY_KEYBOARD
  await bot.sendMessage(chatId, '🤖 HH Auto-Apply', { reply_markup: keyboard })
}

export function registerHHCommands() {
  bot.onText(/\/hhstart/, msg => triggerHHStart(msg.chat.id))

  bot.on('callback_query', async (query) => {
    if (!query.message)
      return

    const chatId = query.message.chat.id
    const messageId = query.message.message_id

    await bot.answerCallbackQuery(query.id).catch(() => {})

    const exactHandler = query.data ? CALLBACK_HANDLERS[query.data] : undefined
    if (exactHandler) {
      await exactHandler(chatId, messageId)
      return
    }

    if (query.data?.startsWith('hh_resume_pick_')) {
      const idx = Number(query.data.replace('hh_resume_pick_', ''))
      await handleResumePick(chatId, messageId, idx)
    }
  })

  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/'))
      return

    const chatId = msg.chat.id
    const state = getState(chatId)

    if (state.isApplying) {
      await bot.sendMessage(chatId, '⏳ Подождите, идут отклики на вакансии...')
      return
    }

    const isAwaiting = state.awaitingEmail || state.awaitingQuery || state.awaitingMax || state.awaitingPrompt
    const isMenuButton = Object.values(BTN).includes(msg.text as typeof BTN[keyof typeof BTN])

    if (isMenuButton && isAwaiting) {
      await clearAwaitingState(chatId)
    }

    if (state.awaitingEmail) {
      state.awaitingEmail = false
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {})
      if (state.loginPromptMessageId) {
        await bot.deleteMessage(chatId, state.loginPromptMessageId).catch(() => {})
        state.loginPromptMessageId = null
      }
      await doLogin(chatId, msg.text)
      return
    }

    if (state.awaitingQuery) {
      state.awaitingQuery = false
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {})
      if (state.queryPromptMessageId) {
        await bot.deleteMessage(chatId, state.queryPromptMessageId).catch(() => {})
        state.queryPromptMessageId = null
      }
      const updated = await prisma.settings.update({ where: { telegramId: chatId }, data: { searchQuery: msg.text } })
      await bot.sendMessage(chatId, `✅ Запрос: "${updated.searchQuery}"`)
      return
    }

    if (state.awaitingMax) {
      const num = Number(msg.text)
      if (Number.isNaN(num) || num < 1 || num > 50) {
        await bot.sendMessage(chatId, '❌ Введи число от 1 до 50:')
        return
      }
      state.awaitingMax = false
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {})
      if (state.maxPromptMessageId) {
        await bot.deleteMessage(chatId, state.maxPromptMessageId).catch(() => {})
        state.maxPromptMessageId = null
      }
      const updated = await prisma.settings.update({ where: { telegramId: chatId }, data: { maxApplies: num } })
      await bot.sendMessage(chatId, `✅ Макс откликов: ${updated.maxApplies}`)
      return
    }

    if (state.awaitingPrompt) {
      state.awaitingPrompt = false
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {})
      if (state.promptPromptMessageId) {
        await bot.deleteMessage(chatId, state.promptPromptMessageId).catch(() => {})
        state.promptPromptMessageId = null
      }
      await prisma.user.upsert({
        where: { telegramId: chatId },
        update: { prompt: msg.text },
        create: { telegramId: chatId, prompt: msg.text, Settings: { create: {} } },
      })
      await bot.sendMessage(chatId, '✅ Промт сохранён')
      return
    }

    await MESSAGE_HANDLERS[msg.text]?.(chatId)
  })
}
