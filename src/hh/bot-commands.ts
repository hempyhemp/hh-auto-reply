import type { ResumeListItem } from './types.js'
import bot from '@bot'
import prisma from '@prisma'
import cron, { type ScheduledTask } from 'node-cron'
import { applyToJobs, checkIsAuth, listResumes, login, saveResume } from './scraper.js'
import { BACK_MARKUP, createStatusReporter, escapeHtml, LOGIN_MARKUP, MAIN_MARKUP, showResult } from './ui.js'

interface UserState {
  autoCron: ScheduledTask | null
  awaitingEmail: boolean
  awaitingQuery: boolean
  awaitingMax: boolean
  tempEmail: string
  pendingResumes: ResumeListItem[]
  menuMessageId: number | null
  loginPromptMessageId: number | null
}

function makeUserState(): UserState {
  return {
    autoCron: null,
    awaitingEmail: false,
    awaitingQuery: false,
    awaitingMax: false,
    tempEmail: '',
    pendingResumes: [],
    menuMessageId: null,
    loginPromptMessageId: null,
  }
}

const states = new Map<number, UserState>()

function getState(chatId: number): UserState {
  if (!states.has(chatId))
    states.set(chatId, makeUserState())
  return states.get(chatId)!
}

async function showMenu(chatId: number, messageId?: number | null): Promise<void> {
  const state = getState(chatId)
  const targetId = messageId ?? state.menuMessageId

  if (targetId) {
    try {
      await bot.editMessageText('🤖 HH Auto-Apply', {
        chat_id: chatId,
        message_id: targetId,
        reply_markup: MAIN_MARKUP,
      })
      state.menuMessageId = targetId
      return
    }
    catch {
      // Сообщение устарело или недоступно — отправим новое
    }
  }

  const msg = await bot.sendMessage(chatId, '🤖 HH Auto-Apply', { reply_markup: MAIN_MARKUP })
  state.menuMessageId = msg.message_id
}

async function sendResumeSelector(chatId: number, resumes: ResumeListItem[], messageId: number): Promise<void> {
  const state = getState(chatId)
  state.pendingResumes = resumes
  await bot.editMessageText('📄 Выбери резюме:', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: {
      inline_keyboard: [
        ...resumes.map((r, i) => [{ text: r.title, callback_data: `hh_resume_pick_${i}` }]),
        [{ text: '◀️ Назад', callback_data: 'hh_back' }],
      ],
    },
  })
}

async function resetMenuToBottom(chatId: number): Promise<void> {
  const state = getState(chatId)
  if (state.menuMessageId) {
    await bot.deleteMessage(chatId, state.menuMessageId).catch(() => {})
    state.menuMessageId = null
  }
}

async function doLogin(chatId: number, email: string): Promise<void> {
  await bot.sendMessage(chatId, '🔄 Логинюсь...')
  try {
    await login(email, chatId)
    await prisma.user.update({ where: { telegramId: chatId }, data: { hhEmail: email } })

    const state = getState(chatId)

    // listResumes может упасть по таймауту сразу после логина — это не критично
    let resumes: ResumeListItem[] | null = null
    try {
      resumes = await listResumes(chatId)
    }
    catch {
      await bot.sendMessage(chatId, '⚠️ Не удалось загрузить резюме — выбери вручную через меню')
    }

    await resetMenuToBottom(chatId)

    if (resumes === null) {
      // таймаут при загрузке резюме — просто показываем меню
    }
    else if (resumes.length === 0) {
      await bot.sendMessage(chatId, '⚠️ Резюме не найдены. Создайте резюме на hh.ru')
    }
    else if (resumes.length === 1) {
      await saveResume(chatId, resumes[0].href)
      await bot.sendMessage(chatId, `✅ Резюме сохранено: ${resumes[0].title}`)
    }
    else {
      // несколько резюме — отправляем новый селектор внизу
      state.pendingResumes = resumes
      const selectorMsg = await bot.sendMessage(chatId, '📄 Выбери резюме:', {
        reply_markup: {
          inline_keyboard: [
            ...resumes.map((r, i) => [{ text: r.title, callback_data: `hh_resume_pick_${i}` }]),
            [{ text: '◀️ Назад', callback_data: 'hh_back' }],
          ],
        },
      })
      state.menuMessageId = selectorMsg.message_id
      return
    }

    await showMenu(chatId)
  }
  catch (e) {
    await resetMenuToBottom(chatId)
    await bot.sendMessage(chatId, `❌ Ошибка: ${(e as Error).message}`)
    await showMenu(chatId)
  }
}

export async function triggerHHStart(chatId: number): Promise<void> {
  const user = await prisma.user.findUnique({ where: { telegramId: chatId } })
  if (!user?.session) {
    const state = getState(chatId)
    const msg = await bot.sendMessage(chatId, '🤖 HH Auto-Apply', { reply_markup: LOGIN_MARKUP })
    state.menuMessageId = msg.message_id
    return
  }
  await showMenu(chatId)
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

    await bot.answerCallbackQuery(query.id)

    const user = await prisma.user.findUnique({
      where: { telegramId: chatId },
      include: { Settings: true },
    })
    const settings = user!.Settings!

    switch (query.data) {
      case 'hh_back':
        await showMenu(chatId, messageId)
        break

      case 'hh_apply': {
        await bot.deleteMessage(chatId, messageId).catch(() => {})
        state.menuMessageId = null

        const reporter = createStatusReporter(chatId)
        await reporter.status(`🔄 Ищу вакансии по запросу "${settings.searchQuery}"...`)

        applyToJobs({ query: settings.searchQuery, maxApplies: settings.maxApplies }, { chatId, reporter })
          .then(async (result) => {
            if (result.error) {
              await bot.sendMessage(chatId, `❌ ${result.error}`)
            }
            else {
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
                result.errors.forEach(v => lines.push(`• <a href="${v.href}">${v.title}</a> — ${v.message}`))
              }

              await bot.sendMessage(chatId, lines.join('\n'), {
                parse_mode: 'HTML',
                disable_web_page_preview: true,
              })
            }
            await showMenu(chatId)
          })
        break
      }

      case 'hh_status': {
        const isAuth = await checkIsAuth(chatId)
        await showResult(
          chatId,
          messageId,
          `⚙️ Настройки:\n\nЗапрос: ${settings.searchQuery}\nМакс откликов: ${settings.maxApplies}\nАвто: ${state.autoCron ? '✅ включено' : '❌ выключено'}\nАвторизован: ${isAuth ? '✅' : '❌'}`,
        )
        break
      }

      case 'hh_my_resume': {
        const resume = await prisma.resume.findFirst({
          where: { telegramId: chatId },
          orderBy: { id: 'asc' },
        })
        if (!resume) {
          await showResult(chatId, messageId, '📋 Резюме не найдено.\n\nВыбери резюме через кнопку 📄 Выбрать резюме.')
          break
        }
        const MAX = 3800
        const text = resume.data.length > MAX
          ? `${resume.data.slice(0, MAX)}\n\n… (текст обрезан)`
          : resume.data
        await bot.editMessageText(
          `📋 <b>Твоё резюме</b>\n<pre>${escapeHtml(text)}</pre>`,
          {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: 'HTML',
            reply_markup: BACK_MARKUP,
          },
        )
        break
      }

      case 'hh_login':
        state.menuMessageId = messageId
        if (!user?.hhEmail) {
          state.awaitingEmail = true
          await bot.sendMessage(chatId, '📧 Введи email от hh.ru:')
        }
        else {
          state.awaitingEmail = true
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
        break

      case 'hh_login_use_current': {
        state.awaitingEmail = false
        await bot.deleteMessage(chatId, messageId).catch(() => {})
        state.loginPromptMessageId = null
        const email = user?.hhEmail
        if (!email) {
          await bot.sendMessage(chatId, '❌ Email не найден, введи вручную')
          state.awaitingEmail = true
          break
        }
        await doLogin(chatId, email)
        break
      }

      case 'hh_query':
      {
        state.awaitingQuery = true
        state.menuMessageId = messageId

        const q = await prisma.settings.findFirst({
          where: { telegramId: chatId },
        })

        await bot.sendMessage(chatId, `🔍Текущий запрос: ${q?.searchQuery || '--'}`)
        await bot.sendMessage(chatId, '🔍 Введи поисковый запрос:')
        break
      }

      case 'hh_max':
        state.awaitingMax = true
        state.menuMessageId = messageId
        await bot.sendMessage(chatId, '🔢 Введи максимальное количество откликов (1-50):')
        break

      case 'hh_auto_start':
        if (state.autoCron) {
          await showResult(chatId, messageId, '⚠️ Авто уже запущено')
          break
        }
        state.autoCron = cron.schedule('0 10 * * 1-5', async () => {
          await bot.sendMessage(chatId, '⏰ Авто-отклик...')
        })
        await showResult(chatId, messageId, '✅ Авто включён (пн-пт, 10:00)')
        break

      case 'hh_auto_stop':
        state.autoCron?.stop()
        state.autoCron = null
        await showResult(chatId, messageId, '⛔ Авто остановлен')
        break

      case 'hh_resume_list': {
        await bot.editMessageText('🔄 Загружаю список резюме...', {
          chat_id: chatId,
          message_id: messageId,
          reply_markup: { inline_keyboard: [] },
        })
        const resumes = await listResumes(chatId)
        if (resumes.length === 0) {
          await showResult(chatId, messageId, '⚠️ Резюме не найдены. Создайте резюме на hh.ru')
        }
        else if (resumes.length === 1) {
          await bot.editMessageText('🔄 Сохраняю резюме...', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [] },
          })
          await saveResume(chatId, resumes[0].href)
          await showResult(chatId, messageId, `✅ Резюме сохранено: ${resumes[0].title}`)
        }
        else {
          state.menuMessageId = messageId
          await sendResumeSelector(chatId, resumes, messageId)
        }
        break
      }

      default: {
        if (query.data?.startsWith('hh_resume_pick_')) {
          const idx = Number(query.data.replace('hh_resume_pick_', ''))
          const resume = state.pendingResumes[idx]
          if (!resume) {
            await showResult(chatId, messageId, '❌ Резюме не найдено, попробуйте снова')
            break
          }
          await bot.editMessageText('🔄 Сохраняю резюме...', {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: { inline_keyboard: [] },
          })
          await saveResume(chatId, resume.href)
          state.pendingResumes = []
          await showResult(chatId, messageId, `✅ Резюме выбрано: ${resume.title}`)
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

    const user = await prisma.user.findUnique({
      where: { telegramId: chatId },
      include: { Settings: true },
    })

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
      await showMenu(chatId)
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
      await showMenu(chatId)
    }
  })
}
