import bot from '@bot'
import prisma from '@prisma'
import { debugFunc } from '@/hh/handlers/debug'
import { handleApply } from './handlers/apply.js'
import { doLogin, doLoginByPhone, handleLogin, handleLoginByEmail, handleLoginByPhone } from './handlers/auth.js'
import { handleSkipped, handleStatus } from './handlers/info.js'
import { finishOnboarding, showPromptStep, showQueryStep, showResumeInfo, showResumeModeStep } from './handlers/onboarding.js'
import { handleAreaPick, handleRegion } from './handlers/region.js'
import { handleMyResume, handleResumeList, handleResumePick } from './handlers/resume.js'
import { DEFAULT_PROMPT, handleAutoToggle, handleMax, handlePrompt, handleQuery, handleSearchModeToggle } from './handlers/settings.js'
import { getState } from './state.js'
import { BTN, INFO_REPLY_KEYBOARD, LOGIN_REPLY_KEYBOARD, MAIN_REPLY_KEYBOARD, buildFiltersKeyboard, buildSettingsKeyboard } from './ui.js'

type MsgHandler = (chatId: number) => Promise<void>
type CallbackHandler = (chatId: number, messageId: number) => Promise<void>

const MESSAGE_HANDLERS: Partial<Record<string, MsgHandler>> = {
  [BTN.APPLY]: handleApply,
  [BTN.STATUS]: handleStatus,
  [BTN.QUERY]: handleQuery,
  [BTN.MAX]: handleMax,
  [BTN.AUTO_TOGGLE]: handleAutoToggle,
  [BTN.SEARCH_MODE_TOGGLE]: handleSearchModeToggle,
  [BTN.PROMPT]: handlePrompt,
  [BTN.LOGIN]: handleLogin,
  [BTN.RESUME_LIST]: handleResumeList,
  [BTN.MY_RESUME]: handleMyResume,
  [BTN.SKIPPED]: handleSkipped,
  [BTN.SETTINGS]: async (chatId) => { await bot.sendMessage(chatId, '⚙️ Настройки:', { reply_markup: await buildSettingsKeyboard(chatId) }) },
  [BTN.FILTERS]: async (chatId) => { await bot.sendMessage(chatId, '🔎 Фильтры:', { reply_markup: await buildFiltersKeyboard(chatId) }) },
  [BTN.INFO]: async (chatId) => { await bot.sendMessage(chatId, 'ℹ️ Информация:', { reply_markup: INFO_REPLY_KEYBOARD }) },
  [BTN.BACK]: async (chatId) => { await bot.sendMessage(chatId, '🤖 HH Auto-Apply', { reply_markup: MAIN_REPLY_KEYBOARD }) },
  [BTN.REGION]: handleRegion,
}

const CALLBACK_HANDLERS: Record<string, CallbackHandler> = {
  hh_back: async (chatId, messageId) => {
    await bot.deleteMessage(chatId, messageId).catch(() => {})
  },
  hh_login: async (chatId, messageId) => {
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await handleLogin(chatId)
  },
  hh_login_method_email: async (chatId, messageId) => {
    const state = getState(chatId)
    state.loginMethodMsgId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await handleLoginByEmail(chatId)
  },
  hh_login_method_phone: async (chatId, messageId) => {
    const state = getState(chatId)
    state.loginMethodMsgId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await handleLoginByPhone(chatId)
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
  hh_login_use_current_phone: async (chatId, messageId) => {
    const state = getState(chatId)
    state.awaitingPhone = false
    state.loginPromptMessageId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
    if (!user?.hhPhone) {
      await bot.sendMessage(chatId, '❌ Телефон не найден, введи вручную')
      state.awaitingPhone = true
      return
    }
    await doLoginByPhone(chatId, user.hhPhone)
  },
  hh_keep_query: async (chatId, messageId) => {
    const state = getState(chatId)
    state.awaitingQuery = false
    state.queryPromptMessageId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
  },
  hh_clear_query: async (chatId, messageId) => {
    const state = getState(chatId)
    state.awaitingQuery = false
    state.queryPromptMessageId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await prisma.settings.update({ where: { telegramId: chatId }, data: { searchQuery: '' } })
    await bot.sendMessage(chatId, '🗑 Запрос очищен')
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
  hh_reset_prompt: async (chatId, messageId) => {
    const state = getState(chatId)
    state.awaitingPrompt = false
    state.promptPromptMessageId = null
    await prisma.user.update({ where: { telegramId: chatId }, data: { prompt: DEFAULT_PROMPT } })
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await bot.sendMessage(chatId, '✅ Промт сброшен на дефолтный')
  },
  ob_skip_max: async (chatId, messageId) => {
    const state = getState(chatId)
    state.onboardingStep = null
    state.onboardingMsgId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await showQueryStep(chatId)
  },
  ob_skip_query: async (chatId, messageId) => {
    const state = getState(chatId)
    state.onboardingStep = null
    state.onboardingMsgId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await showResumeModeStep(chatId)
  },
  ob_resume_mode_enable: async (chatId, messageId) => {
    const state = getState(chatId)
    state.onboardingStep = null
    state.onboardingMsgId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await prisma.settings.update({ where: { telegramId: chatId }, data: { searchMode: 'resume' } })
    await bot.sendMessage(chatId, '✅ Поиск по резюме <b>включён</b>', { parse_mode: 'HTML' })
    await showResumeInfo(chatId)
    await showPromptStep(chatId)
  },
  ob_resume_mode_disable: async (chatId, messageId) => {
    const state = getState(chatId)
    state.onboardingStep = null
    state.onboardingMsgId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await prisma.settings.update({ where: { telegramId: chatId }, data: { searchMode: 'text' } })
    await bot.sendMessage(chatId, '⛔ Поиск по резюме <b>выключен</b>', { parse_mode: 'HTML' })
    await showResumeInfo(chatId)
    await showPromptStep(chatId)
  },
  ob_skip_resume_mode: async (chatId, messageId) => {
    const state = getState(chatId)
    state.onboardingStep = null
    state.onboardingMsgId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await showResumeInfo(chatId)
    await showPromptStep(chatId)
  },
  ob_skip_prompt: async (chatId, messageId) => {
    const state = getState(chatId)
    state.onboardingStep = null
    state.onboardingMsgId = null
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await finishOnboarding(chatId)
  },
  hh_resume_list: async (chatId, messageId) => {
    await bot.deleteMessage(chatId, messageId).catch(() => {})
    await handleResumeList(chatId)
  },
}

async function clearAwaitingState(chatId: number): Promise<void> {
  const state = getState(chatId)
  const msgIds = [
    state.loginMethodMsgId,
    state.loginPromptMessageId,
    state.queryPromptMessageId,
    state.maxPromptMessageId,
    state.promptPromptMessageId,
    state.onboardingMsgId,
  ]
  state.awaitingEmail = false
  state.awaitingPhone = false
  state.awaitingQuery = false
  state.awaitingMax = false
  state.awaitingPrompt = false
  state.onboardingStep = null
  state.onboardingMsgId = null
  state.loginMethodMsgId = null
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
    else if (query.data?.startsWith('hh_area_')) {
      const code = query.data.replace('hh_area_', '')
      await handleAreaPick(chatId, messageId, code)
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

    const isAwaiting = state.awaitingEmail || state.awaitingPhone || state.awaitingQuery || state.awaitingMax || state.awaitingPrompt || state.onboardingStep !== null
    const isMenuButton = Object.values(BTN).includes(msg.text as typeof BTN[keyof typeof BTN])
      || msg.text.startsWith(BTN.SEARCH_MODE_TOGGLE)
      || msg.text.startsWith(BTN.REGION)

    if (isMenuButton && isAwaiting) {
      await clearAwaitingState(chatId)
    }

    if (state.onboardingStep === 'max') {
      const num = Number(msg.text)
      if (Number.isNaN(num) || num < 1 || num > 50) {
        await bot.sendMessage(chatId, '❌ Введи число от 1 до 50:')
        return
      }
      state.onboardingStep = null
      if (state.onboardingMsgId) {
        await bot.deleteMessage(chatId, state.onboardingMsgId).catch(() => {})
        state.onboardingMsgId = null
      }
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {})
      await prisma.settings.update({ where: { telegramId: chatId }, data: { maxApplies: num } })
      await bot.sendMessage(chatId, `✅ Макс откликов: ${num}`)
      await showQueryStep(chatId)
      return
    }

    if (state.onboardingStep === 'query') {
      state.onboardingStep = null
      if (state.onboardingMsgId) {
        await bot.deleteMessage(chatId, state.onboardingMsgId).catch(() => {})
        state.onboardingMsgId = null
      }
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {})
      const updated = await prisma.settings.update({ where: { telegramId: chatId }, data: { searchQuery: msg.text } })
      await bot.sendMessage(chatId, `✅ Запрос: «${updated.searchQuery}»`)
      await showResumeModeStep(chatId)
      return
    }

    if (state.onboardingStep === 'prompt') {
      state.onboardingStep = null
      if (state.onboardingMsgId) {
        await bot.deleteMessage(chatId, state.onboardingMsgId).catch(() => {})
        state.onboardingMsgId = null
      }
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {})
      await prisma.user.upsert({
        where: { telegramId: chatId },
        update: { prompt: msg.text },
        create: { telegramId: chatId, prompt: msg.text, Settings: { create: {} } },
      })
      await bot.sendMessage(chatId, '✅ Промт сохранён')
      await finishOnboarding(chatId)
      return
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

    if (state.awaitingPhone) {
      state.awaitingPhone = false
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {})
      if (state.loginPromptMessageId) {
        await bot.deleteMessage(chatId, state.loginPromptMessageId).catch(() => {})
        state.loginPromptMessageId = null
      }
      await doLoginByPhone(chatId, msg.text)
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

    const handler = MESSAGE_HANDLERS[msg.text]
      ?? (msg.text.startsWith(BTN.SEARCH_MODE_TOGGLE) ? MESSAGE_HANDLERS[BTN.SEARCH_MODE_TOGGLE] : undefined)
      ?? (msg.text.startsWith(BTN.REGION) ? MESSAGE_HANDLERS[BTN.REGION] : undefined)
    await handler?.(chatId)
  })
}
