import bot from '@bot'
import prisma from '@prisma'
import cron from 'node-cron'
import { SETTINGS_REPLY_KEYBOARD, escapeHtml } from '../ui.js'
import { getState } from '../state.js'

export async function handleQuery(chatId: number): Promise<void> {
  const state = getState(chatId)
  state.awaitingQuery = true
  const settings = await prisma.settings.findFirst({ where: { telegramId: chatId } })
  const currentQuery = settings?.searchQuery || '--'
  const msg = await bot.sendMessage(
    chatId,
    `🔍 Текущий запрос: <b>${escapeHtml(currentQuery)}</b>\n\nВведи новый или оставь текущий:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: `✅ Оставить «${currentQuery}»`, callback_data: 'hh_keep_query' },
        ]],
      },
    },
  )
  state.queryPromptMessageId = msg.message_id
}

export async function handleMax(chatId: number): Promise<void> {
  const state = getState(chatId)
  state.awaitingMax = true
  const settings = await prisma.settings.findFirst({ where: { telegramId: chatId } })
  const currentMax = settings?.maxApplies ?? '--'
  const msg = await bot.sendMessage(
    chatId,
    `🔢 Текущее значение: <b>${currentMax}</b>\n\nВведи новое количество откликов (1–50) или оставь текущее:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: `✅ Оставить ${currentMax}`, callback_data: 'hh_keep_max' },
        ]],
      },
    },
  )
  state.maxPromptMessageId = msg.message_id
}

export async function handlePrompt(chatId: number): Promise<void> {
  const state = getState(chatId)
  state.awaitingPrompt = true
  const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
  const currentPrompt = user?.prompt
  const text = currentPrompt
    ? `📝 Текущий промт:\n<pre>${escapeHtml(currentPrompt)}</pre>\n\nВведи новый или оставь текущий:`
    : '📝 Введи промт для AI (пока не задан):'
  const keepButton = currentPrompt
    ? [[{ text: '✅ Оставить текущий промт', callback_data: 'hh_keep_prompt' }]]
    : []
  const msg = await bot.sendMessage(chatId, text, {
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: keepButton },
  })
  state.promptPromptMessageId = msg.message_id
}

export async function handleAutoToggle(chatId: number): Promise<void> {
  const state = getState(chatId)
  if (state.autoCron) {
    state.autoCron.stop()
    state.autoCron = null
    await bot.sendMessage(chatId, '⛔ Авто остановлен', { reply_markup: SETTINGS_REPLY_KEYBOARD })
  }
  else {
    state.autoCron = cron.schedule('0 10 * * 1-5', async () => {
      await bot.sendMessage(chatId, '⏰ Авто-отклик...')
    })
    await bot.sendMessage(chatId, '✅ Авто включён (пн-пт, 10:00)', { reply_markup: SETTINGS_REPLY_KEYBOARD })
  }
}
