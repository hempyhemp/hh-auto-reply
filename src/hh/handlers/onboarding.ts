import bot from '@bot'
import prisma from '@prisma'
import { getState } from '../state.js'
import { escapeHtml, MAIN_REPLY_KEYBOARD } from '../ui.js'
import { DEFAULT_PROMPT } from './settings.js'

export async function startOnboarding(chatId: number): Promise<void> {
  await bot.sendMessage(
    chatId,
    `👋 <b>Давай настроим бота</b> — займёт меньше минуты.\n\nПройдём по ключевым параметрам.`,
    { parse_mode: 'HTML' },
  )
  await showMaxStep(chatId)
}

export async function showMaxStep(chatId: number): Promise<void> {
  const state = getState(chatId)
  state.onboardingStep = 'max'
  const settings = await prisma.settings.findFirst({ where: { telegramId: chatId } })
  const current = settings?.maxApplies ?? 1

  const msg = await bot.sendMessage(
    chatId,
    `🔢 <b>Шаг 1 из 3 — Максимум откликов</b>\n\n`
    + `Сколько вакансий бот обработает за один запуск. Рекомендуем начать с небольшого числа, чтобы проверить письма.\n\n`
    + `Можно оставить текущее значение: <b>${current}</b> или ввести число в чат от 1 до 50:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: `Оставить ${current} ✓`, callback_data: 'ob_skip_max' },
        ]],
      },
    },
  )
  state.onboardingMsgId = msg.message_id
}

export async function showQueryStep(chatId: number): Promise<void> {
  const state = getState(chatId)
  state.onboardingStep = 'query'
  const settings = await prisma.settings.findFirst({ where: { telegramId: chatId } })
  const current = settings?.searchQuery || 'Vue'

  const msg = await bot.sendMessage(
    chatId,
    `🔍 <b>Шаг 2 из 3 — Поисковый запрос</b>\n\n`
    + `По этому запросу бот ищет вакансии на hh.ru. Используй профессию или ключевые навыки.\n\n`
    + `Текущий запрос: <b>${current}</b>\n\n`
    + `Введи новый или оставь текущий:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: `Оставить «${current}» ✓`, callback_data: 'ob_skip_query' },
        ]],
      },
    },
  )
  state.onboardingMsgId = msg.message_id
}

export async function showResumeInfo(chatId: number): Promise<void> {
  const settings = await prisma.settings.findFirst({ where: { telegramId: chatId } })
  const resume = settings?.selectedResumeId
    ? await prisma.resume.findUnique({ where: { id: settings.selectedResumeId } })
    : await prisma.resume.findFirst({ where: { telegramId: chatId } })

  if (resume) {
    await bot.sendMessage(
      chatId,
      `📄 <b>Резюме</b>\n\nАктивное резюме: <b>${resume.title}</b>\n\nЕсли у тебя несколько резюме на hh.ru — можно выбрать нужное через <i>Настройки → Выбрать резюме</i>.`,
      { parse_mode: 'HTML' },
    )
  }
  else {
    await bot.sendMessage(
      chatId,
      `📄 <b>Резюме</b>\n\nРезюме пока не выбрано. Создай его на hh.ru, затем выбери через <i>Настройки → Выбрать резюме</i>.`,
      { parse_mode: 'HTML' },
    )
  }
}

export async function showPromptStep(chatId: number): Promise<void> {
  const state = getState(chatId)
  state.onboardingStep = 'prompt'
  const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
  const currentPrompt = user?.prompt || DEFAULT_PROMPT

  const msg = await bot.sendMessage(
    chatId,
    `📝 <b>Шаг 3 из 3 — Промт для AI</b>\n\n`
    + `Инструкция, которую AI получает при написании сопроводительного письма. `
    + `Задаёт стиль, тон и то, что важно упомянуть.\n\n`
    + `<i>Текущий промт:</i>\n<pre>${escapeHtml(currentPrompt)}</pre>\n\n`
    + `Введи свой или оставь дефолтный:`,
    {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[
          { text: 'Оставить дефолтный ✓', callback_data: 'ob_skip_prompt' },
        ]],
      },
    },
  )
  state.onboardingMsgId = msg.message_id
}

export async function finishOnboarding(chatId: number): Promise<void> {
  const state = getState(chatId)
  state.onboardingStep = null
  state.onboardingMsgId = null
  await bot.sendMessage(
    chatId,
    `🎉 <b>Настройка завершена!</b>\n\nВсё готово — нажми <b>🚀 Откликнуться</b>, чтобы запустить бота.\n\nДополнительные параметры (запрос, регион, слова-исключения) доступны в разделе <b>Фильтры</b>.`,
    { parse_mode: 'HTML', reply_markup: MAIN_REPLY_KEYBOARD },
  )
}
