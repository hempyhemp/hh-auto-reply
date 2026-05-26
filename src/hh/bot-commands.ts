import bot from '@bot'
import prisma from '@prisma'
import cron, { type ScheduledTask } from 'node-cron'
import { applyToJobs, checkIsAuth, listResumes, login, type ResumeListItem, saveResume } from './scraper.js'

interface UserState {
  autoCron: ScheduledTask | null
  awaitingEmail: boolean
  awaitingQuery: boolean
  awaitingMax: boolean
  tempEmail: string
  pendingResumes: ResumeListItem[]
}

function makeUserState(): UserState {
  return {
    autoCron: null,
    awaitingEmail: false,
    awaitingQuery: false,
    awaitingMax: false,
    tempEmail: '',
    pendingResumes: [],
  }
}

const states = new Map<number, UserState>()

function getState(chatId: number): UserState {
  if (!states.has(chatId))
    states.set(chatId, makeUserState())
  return states.get(chatId)!
}

async function sendResumeSelector(chatId: number, resumes: ResumeListItem[]) {
  getState(chatId).pendingResumes = resumes
  await bot.sendMessage(chatId, '📄 Выбери резюме:', {
    reply_markup: {
      inline_keyboard: resumes.map((r, i) => [
        { text: r.title, callback_data: `hh_resume_pick_${i}` },
      ]),
    },
  })
}

export function triggerHHStart(chatId: number): void {
  bot.sendMessage(chatId, '🤖 HH Auto-Apply', {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🚀 Откликнуться сейчас', callback_data: 'hh_apply' },
        ],
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
        ],
      ],
    },
  })
}

export function registerHHCommands() {
  bot.onText(/\/hhstart/, (msg) => {
    triggerHHStart(msg.chat.id)
  })

  bot.on('callback_query', async (query) => {
    if (!query.message)
      return
    const chatId = query.message.chat.id
    const state = getState(chatId)

    bot.answerCallbackQuery(query.id)

    const user = await prisma.user.findUnique({
      where: { telegramId: chatId },
      include: { Settings: true },
    })

    const settings = user!.Settings!

    switch (query.data) {
      case 'hh_apply':
        await bot.sendMessage(chatId, `🚀 Ищу: "${settings.searchQuery}"...`)
        applyToJobs({ query: settings.searchQuery, maxApplies: settings.maxApplies }, {
          chatId,
        }).then((result) => {
          if (result.error)
            return bot.sendMessage(chatId, `❌ ${result.error}`)
          const lines = result.applied.map((v, i) => `${i + 1}. ${v}`).join('\n')
          bot.sendMessage(chatId, `✅ Откликнулся: ${result.applied.length}\n${lines}\n\n`
          + `⏭ Пропущено: ${result.skipped.length}\n${
            result.errors.length ? `❌ Ошибок: ${result.errors.length}` : ''}`)
        })
        break

      case 'hh_status':
        await bot.sendMessage(chatId, `⚙️ Настройки:\n
        Запрос: ${settings.searchQuery}\n
        Макс откликов: ${settings.maxApplies}\n
        Авто: ${state.autoCron ? '✅ включено' : '❌ выключено'}\n
        Авторизован: ${await checkIsAuth(chatId)}`)
        break

      case 'hh_login':
        state.awaitingEmail = true
        if (!user?.hhEmail) {
          await bot.sendMessage(chatId, '📧 Введи email от hh.ru:')
        }
        else {
          await bot.sendMessage(chatId, `📧 Email от hh.ru: ${user?.hhEmail}`)
        }
        break

      case 'hh_query':
        state.awaitingQuery = true
        await bot.sendMessage(chatId, '🔍 Введи поисковый запрос:')
        break

      case 'hh_max':
        state.awaitingMax = true
        await bot.sendMessage(chatId, '🔢 Введи максимальное количество откликов (1-50):')
        break

      case 'hh_auto_start':
        if (state.autoCron) {
          await bot.sendMessage(chatId, 'Уже запущено!')
          break
        }
        state.autoCron = cron.schedule('0 10 * * 1-5', async () => {
          await bot.sendMessage(chatId, '⏰ Авто-отклик...')
        })
        await bot.sendMessage(chatId, '✅ Авто включён (пн-пт, 10:00)')
        break

      case 'hh_auto_stop':
        state.autoCron?.stop()
        state.autoCron = null
        await bot.sendMessage(chatId, '⛔ Авто остановлен')
        break

      case 'hh_resume_list': {
        await bot.sendMessage(chatId, '🔄 Загружаю список резюме...')
        const resumes = await listResumes(chatId)
        if (resumes.length === 0) {
          await bot.sendMessage(chatId, '❌ Резюме не найдены. Создайте резюме на hh.ru')
        }
        else if (resumes.length === 1) {
          await bot.sendMessage(chatId, '🔄 Сохраняю резюме...')
          await saveResume(chatId, resumes[0].href)
          await bot.sendMessage(chatId, `✅ Резюме сохранено: ${resumes[0].title}`)
        }
        else {
          await sendResumeSelector(chatId, resumes)
        }
        break
      }

      default: {
        if (query.data?.startsWith('hh_resume_pick_')) {
          const idx = Number(query.data.replace('hh_resume_pick_', ''))
          const resume = state.pendingResumes[idx]
          if (!resume) {
            await bot.sendMessage(chatId, '❌ Резюме не найдено, попробуйте снова')
            break
          }
          await bot.sendMessage(chatId, '🔄 Сохраняю резюме...')
          await saveResume(chatId, resume.href)
          await bot.sendMessage(chatId, `✅ Резюме выбрано: ${resume.title}`)
          state.pendingResumes = []
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
      state.tempEmail = user?.hhEmail || msg.text
      state.awaitingEmail = false

      await bot.deleteMessage(chatId, msg.message_id).catch(() => {})
      await bot.sendMessage(chatId, '🔄 Логинюсь...')
      try {
        await login(state.tempEmail, chatId)
        await bot.sendMessage(chatId, '✅ Авторизован! Куки сохранены.')

        await prisma.user.update({
          where: { telegramId: chatId },
          data: { hhEmail: state.tempEmail },
        })

        const resumes = await listResumes(chatId)
        if (resumes.length === 0) {
          await bot.sendMessage(chatId, '❌ Резюме не найдены. Создайте резюме на hh.ru')
        }
        else if (resumes.length === 1) {
          await saveResume(chatId, resumes[0].href)
          await bot.sendMessage(chatId, `✅ Резюме сохранено: ${resumes[0].title}`)
        }
        else {
          await sendResumeSelector(chatId, resumes)
        }

        triggerHHStart(chatId)
      }
      catch (e) {
        await bot.sendMessage(chatId, `😬 Ошибка: ${(e as Error).message}`)
      }
      return
    }

    if (state.awaitingQuery) {
      state.awaitingQuery = false
      const updated = await prisma.settings.update({
        where: { telegramId: chatId },
        data: { searchQuery: msg.text },
      })
      await bot.sendMessage(chatId, `✅ Запрос: "${updated.searchQuery}"`)
      return
    }

    if (state.awaitingMax) {
      state.awaitingMax = false
      const num = Number(msg.text)
      if (num < 1 || num > 50) {
        await bot.sendMessage(chatId, '❌ Число от 1 до 50')
        return
      }
      const updated = await prisma.settings.update({
        where: { telegramId: chatId },
        data: { maxApplies: num },
      })
      await bot.sendMessage(chatId, `✅ Макс откликов: ${updated.maxApplies}`)
    }
  })
}
