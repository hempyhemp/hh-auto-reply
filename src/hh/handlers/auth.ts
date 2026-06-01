import bot from '@bot'
import prisma from '@prisma'
import { listResumes, login, saveResume } from '../scraper.js'
import { getState } from '../state.js'
import { startOnboarding } from './onboarding.js'
import type { ResumeListItem } from '../types.js'

export async function doLogin(chatId: number, email: string): Promise<void> {
  await bot.sendMessage(chatId, '🔄 Логинюсь...')
  try {
    await login(email, chatId)
    await prisma.user.upsert({
      where: { telegramId: chatId },
      update: { hhEmail: email },
      create: { telegramId: chatId, hhEmail: email, Settings: { create: {} } },
    })

    const state = getState(chatId)

    let resumes: ResumeListItem[] | null = null
    try {
      resumes = await listResumes(chatId)
    }
    catch {
      await bot.sendMessage(chatId, '⚠️ Не удалось загрузить резюме — выбери вручную через меню')
    }

    await bot.sendMessage(chatId, '✅ Вход выполнен!')

    if (resumes === null || resumes.length === 0) {
      if (resumes?.length === 0)
        await bot.sendMessage(chatId, '⚠️ Резюме не найдены. Создайте резюме на hh.ru')
      await startOnboarding(chatId)
    }
    else if (resumes.length === 1) {
      await saveResume(chatId, resumes[0])
      await bot.sendMessage(chatId, `✅ Резюме сохранено: ${resumes[0].title}`)
      await startOnboarding(chatId)
    }
    else {
      state.pendingResumes = resumes
      state.onboardingAfterResume = true
      await bot.sendMessage(chatId, '📄 Выбери резюме:', {
        reply_markup: {
          inline_keyboard: [
            ...resumes.map((r, i) => [{ text: r.title, callback_data: `hh_resume_pick_${i}` }]),
            [{ text: '◀️ Закрыть', callback_data: 'hh_back' }],
          ],
        },
      })
    }
  }
  catch (e) {
    await bot.sendMessage(chatId, `❌ Ошибка: ${(e as Error).message}`)
  }
}

export async function handleLogin(chatId: number): Promise<void> {
  const state = getState(chatId)
  const msg = await bot.sendMessage(chatId, '🔐 Выбери способ входа:', {
    reply_markup: {
      inline_keyboard: [[
        { text: '📧 Email', callback_data: 'hh_login_method_email' },
        { text: '📱 Телефон', callback_data: 'hh_login_method_phone' },
      ]],
    },
  })
  state.loginMethodMsgId = msg.message_id
}

export async function handleLoginByEmail(chatId: number): Promise<void> {
  const state = getState(chatId)
  const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
  state.awaitingEmail = true

  if (!user?.hhEmail) {
    await bot.sendMessage(chatId, '📧 Введи email от hh.ru:')
  }
  else {
    const prompt = await bot.sendMessage(
      chatId,
      `📧 Текущий email: <b>${user.hhEmail}</b>\n\nИспользовать его или введи другой:`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [[
            { text: `✅ Войти как ${user.hhEmail}`, callback_data: 'hh_login_use_current' },
          ]],
        },
      },
    )
    state.loginPromptMessageId = prompt.message_id
  }
}

export async function handleLoginByPhone(chatId: number): Promise<void> {
  await bot.sendMessage(chatId, '📱 Авторизация по телефону — скоро будет доступна')
}
