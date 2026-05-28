import type { ResumeListItem } from './types.js'
import bot from '@bot'
import prisma from '@prisma'
import cron, { type ScheduledTask } from 'node-cron'
import { applyToJobs, checkIsAuth, listResumes, login, NoResumeError, saveResume } from './scraper.js'
import { BACK_MARKUP, BTN, createStatusReporter, escapeHtml, INFO_REPLY_KEYBOARD, LOGIN_REPLY_KEYBOARD, MAIN_REPLY_KEYBOARD, NO_RESUME_MARKUP, safeEdit, SETTINGS_REPLY_KEYBOARD } from './ui.js'

interface UserState {
  autoCron: ScheduledTask | null
  awaitingEmail: boolean
  awaitingQuery: boolean
  awaitingMax: boolean
  awaitingPrompt: boolean
  pendingResumes: ResumeListItem[]
  loginPromptMessageId: number | null
}

function makeUserState(): UserState {
  return {
    autoCron: null,
    awaitingEmail: false,
    awaitingQuery: false,
    awaitingMax: false,
    awaitingPrompt: false,
    pendingResumes: [],
    loginPromptMessageId: null,
  }
}

const states = new Map<number, UserState>()

function getState(chatId: number): UserState {
  if (!states.has(chatId))
    states.set(chatId, makeUserState())
  return states.get(chatId)!
}

async function doLogin(chatId: number, email: string): Promise<void> {
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

    await bot.sendMessage(chatId, '✅ Вход выполнен!', { reply_markup: MAIN_REPLY_KEYBOARD })

    if (resumes === null) {
      // таймаут при загрузке резюме
    }
    else if (resumes.length === 0) {
      await bot.sendMessage(chatId, '⚠️ Резюме не найдены. Создайте резюме на hh.ru')
    }
    else if (resumes.length === 1) {
      await saveResume(chatId, resumes[0])
      await bot.sendMessage(chatId, `✅ Резюме сохранено: ${resumes[0].title}`)
    }
    else {
      state.pendingResumes = resumes
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

async function handleApply(chatId: number): Promise<void> {
  const settings = await prisma.settings.findUnique({ where: { telegramId: chatId } })
  if (!settings)
    return

  const reporter = createStatusReporter(chatId)
  await reporter.keep(`🔄 Ищу вакансии по запросу "${settings.searchQuery}"...`)

  applyToJobs({ query: settings.searchQuery, maxApplies: settings.maxApplies }, { chatId, reporter })
    .then(async (result) => {
      if (result.error) {
        await bot.sendMessage(chatId, `❌ ${result.error}`)
        return
      }

      const lines: string[] = []
      lines.push(`📊 <b>Итого по запросу «${settings.searchQuery}»</b>`)
      lines.push(`✅ Откликнулся: ${result.applied.length}`)
      lines.push(`⏭ Пропущено: ${result.skipped.length}`)
      if (result.errors.length)
        lines.push(`❌ Ошибок: ${result.errors.length}`)

      if (result.skipped.length) {
        lines.push('')
        lines.push('⏭ <b>Пропущенные:</b>')
        result.skipped.forEach(v => lines.push(`• <a href="${v.href}">${v.title}</a>`))
      }

      if (result.errors.length) {
        lines.push('')
        lines.push('❌ <b>Ошибки:</b>')
        result.errors.forEach(v => lines.push(`• <a href="${v.href}">${escapeHtml(v.title)}</a> — ${escapeHtml(v.message ?? '')}`))
      }

      const fullText = lines.join('\n')
      const LIMIT = 4000
      for (let i = 0; i < fullText.length; i += LIMIT) {
        await bot.sendMessage(chatId, fullText.slice(i, i + LIMIT), {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        })
      }
    })
}

async function handleStatus(chatId: number): Promise<void> {
  const state = getState(chatId)
  const settings = await prisma.settings.findUnique({ where: { telegramId: chatId } })
  const isAuth = await checkIsAuth(chatId)
  await bot.sendMessage(
    chatId,
    `⚙️ Настройки:\n\nЗапрос: ${settings?.searchQuery ?? '--'}\nМакс откликов: ${settings?.maxApplies ?? '--'}\nАвто: ${state.autoCron ? '✅ включено' : '❌ выключено'}\nАвторизован: ${isAuth ? '✅' : '❌'}`,
    { reply_markup: BACK_MARKUP },
  )
}

async function handleLogin(chatId: number): Promise<void> {
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

async function handleResumeList(chatId: number): Promise<void> {
  const state = getState(chatId)
  const loadingMsg = await bot.sendMessage(chatId, '🔄 Загружаю список резюме...')

  let resumes: ResumeListItem[]
  try {
    resumes = await listResumes(chatId)
    console.log(`[handleResumeList ${chatId}]: ${resumes}`)
  }
  catch (e) {
    await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {})
    if (e instanceof NoResumeError) {
      await bot.sendMessage(
        chatId,
        '📝 Резюме не найдено.\n\nСоздайте резюме на <a href="https://hh.ru/applicant/resumes/new">hh.ru</a>, затем нажмите <b>Повторить</b>.',
        { parse_mode: 'HTML', reply_markup: NO_RESUME_MARKUP },
      )
    }
    else {
      await bot.sendMessage(chatId, '❌ Не удалось загрузить резюме. Попробуйте войти заново через «Войти на hh.ru».')
    }
    return
  }

  await bot.deleteMessage(chatId, loadingMsg.message_id).catch(() => {})

  if (resumes.length === 0) {
    await bot.sendMessage(chatId, '⚠️ Резюме не найдены. Создайте резюме на hh.ru')
  }
  else if (resumes.length === 1) {
    await saveResume(chatId, resumes[0])
    await bot.sendMessage(chatId, `✅ Резюме сохранено: ${resumes[0].title}`)
  }
  else {
    state.pendingResumes = resumes
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

async function handleMyResume(chatId: number): Promise<void> {
  const settings = await prisma.settings.findUnique({ where: { telegramId: chatId } })
  const resume = settings?.selectedResumeId
    ? await prisma.resume.findUnique({ where: { id: settings.selectedResumeId } })
    : await prisma.resume.findFirst({ where: { telegramId: chatId } })

  if (!resume) {
    await bot.sendMessage(chatId, '📋 Резюме не найдено.\n\nВыбери резюме через кнопку 📄 Выбрать резюме.')
    return
  }

  const MAX = 3500
  const text = resume.data.length > MAX
    ? `${resume.data.slice(0, MAX)}\n\n… (текст обрезан)`
    : resume.data

  await bot.sendMessage(
    chatId,
    `📋 <b>Твоё резюме:</b>\n<b>${resume.title}</b>\n<pre>${escapeHtml(text)}</pre>`,
    { parse_mode: 'HTML', reply_markup: BACK_MARKUP },
  )
}

async function handleSkipped(chatId: number): Promise<void> {
  const skipped = await prisma.skippedVacancy.findMany({
    where: { telegramId: chatId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })

  if (!skipped.length) {
    await bot.sendMessage(chatId, '✅ Проблемных вакансий нет')
    return
  }

  const lines = ['🚫 <b>Вакансии с опросником (бот не может откликнуться):</b>', '']
  skipped.forEach(v => lines.push(`• <a href="${escapeHtml(v.href)}">${escapeHtml(v.title)}</a>`))
  await bot.sendMessage(chatId, lines.join('\n'), {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    reply_markup: BACK_MARKUP,
  })
}

export async function triggerHHStart(chatId: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
  const keyboard = user?.session ? MAIN_REPLY_KEYBOARD : LOGIN_REPLY_KEYBOARD
  await bot.sendMessage(chatId, '🤖 HH Auto-Apply', { reply_markup: keyboard })
}

export function registerHHCommands() {
  bot.onText(/\/hhstart/, (msg) => {
    triggerHHStart(msg.chat.id)
  })

  bot.on('callback_query', async (query) => {
    if (!query.message)
      return

    const chatId = query.message.chat.id
    const messageId = query.message.message_id
    const state = getState(chatId)

    await bot.answerCallbackQuery(query.id).catch(() => {})

    switch (query.data) {
      case 'hh_back':
        await bot.deleteMessage(chatId, messageId).catch(() => {})
        break

      case 'hh_login':
        await bot.deleteMessage(chatId, messageId).catch(() => {})
        await handleLogin(chatId)
        break

      case 'hh_login_use_current': {
        state.awaitingEmail = false
        await bot.deleteMessage(chatId, messageId).catch(() => {})
        state.loginPromptMessageId = null
        const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
        if (!user?.hhEmail) {
          await bot.sendMessage(chatId, '❌ Email не найден, введи вручную')
          state.awaitingEmail = true
          break
        }
        await doLogin(chatId, user.hhEmail)
        break
      }

      case 'hh_resume_list':
        await bot.deleteMessage(chatId, messageId).catch(() => {})
        await handleResumeList(chatId)
        break

      default: {
        if (query.data?.startsWith('hh_resume_pick_')) {
          const idx = Number(query.data.replace('hh_resume_pick_', ''))
          const resume = state.pendingResumes[idx]
          if (!resume) {
            await safeEdit('❌ Резюме не найдено, попробуйте снова', {
              chat_id: chatId,
              message_id: messageId,
              reply_markup: { inline_keyboard: [] },
            })
            break
          }
          await safeEdit('🔄 Сохраняю резюме...', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [] },
          })
          await saveResume(chatId, resume)
          state.pendingResumes = []
          await safeEdit(`✅ Резюме выбрано: ${resume.title}`, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: BACK_MARKUP,
          })
        }
        break
      }
    }
  })

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id

    if (!msg.text || msg.text.startsWith('/'))
      return

    const state = getState(chatId)

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
      const updated = await prisma.settings.update({
        where: { telegramId: chatId },
        data: { searchQuery: msg.text },
      })
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
      const updated = await prisma.settings.update({
        where: { telegramId: chatId },
        data: { maxApplies: num },
      })
      await bot.sendMessage(chatId, `✅ Макс откликов: ${updated.maxApplies}`)
      return
    }

    if (state.awaitingPrompt) {
      state.awaitingPrompt = false
      await bot.deleteMessage(chatId, msg.message_id).catch(() => {})
      await prisma.user.upsert({
        where: { telegramId: chatId },
        update: { prompt: msg.text },
        create: { telegramId: chatId, prompt: msg.text, Settings: { create: {} } },
      })
      await bot.sendMessage(chatId, '✅ Промт сохранён')
      return
    }

    switch (msg.text) {
      case BTN.APPLY:
        await handleApply(chatId)
        break

      case BTN.STATUS:
        await handleStatus(chatId)
        break

      case BTN.QUERY: {
        state.awaitingQuery = true
        const q = await prisma.settings.findFirst({ where: { telegramId: chatId } })
        await bot.sendMessage(chatId, `🔍 Текущий запрос: ${q?.searchQuery || '--'}`)
        await bot.sendMessage(chatId, '🔍 Введи новый поисковый запрос:')
        break
      }

      case BTN.MAX:
        state.awaitingMax = true
        await bot.sendMessage(chatId, '🔢 Введи максимальное количество откликов (1-50):')
        break

      case BTN.AUTO_TOGGLE: {
        const s = getState(chatId)
        if (s.autoCron) {
          s.autoCron.stop()
          s.autoCron = null
          await bot.sendMessage(chatId, '⛔ Авто остановлен', { reply_markup: SETTINGS_REPLY_KEYBOARD })
        }
        else {
          s.autoCron = cron.schedule('0 10 * * 1-5', async () => {
            await bot.sendMessage(chatId, '⏰ Авто-отклик...')
          })
          await bot.sendMessage(chatId, '✅ Авто включён (пн-пт, 10:00)', { reply_markup: SETTINGS_REPLY_KEYBOARD })
        }
        break
      }

      case BTN.SETTINGS:
        await bot.sendMessage(chatId, '⚙️ Настройки:', { reply_markup: SETTINGS_REPLY_KEYBOARD })
        break

      case BTN.INFO:
        await bot.sendMessage(chatId, 'ℹ️ Информация:', { reply_markup: INFO_REPLY_KEYBOARD })
        break

      case BTN.BACK:
        await bot.sendMessage(chatId, '🤖 HH Auto-Apply', { reply_markup: MAIN_REPLY_KEYBOARD })
        break

      case BTN.PROMPT: {
        state.awaitingPrompt = true
        const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
        const current = user?.prompt ? `\n\nТекущий:\n<pre>${escapeHtml(user.prompt)}</pre>` : ''
        await bot.sendMessage(chatId, `📝 Введи новый промт для AI:${current}`, { parse_mode: 'HTML' })
        break
      }

      case BTN.LOGIN:
        await handleLogin(chatId)
        break

      case BTN.RESUME_LIST:
        await handleResumeList(chatId)
        break

      case BTN.MY_RESUME:
        await handleMyResume(chatId)
        break

      case BTN.SKIPPED:
        await handleSkipped(chatId)
        break
    }
  })
}
