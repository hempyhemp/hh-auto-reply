import bot from '@bot'
import prisma from '@prisma'
import cron, { type ScheduledTask } from 'node-cron'
import { applyToJobs, checkIsAuth, login } from './scraper.js'

interface State {
  autoCron: ScheduledTask | null
  awaitingEmail: boolean
  awaitingPassword: boolean
  awaitingQuery: boolean
  awaitingMax: boolean
  awaitingOTP: boolean
  tempEmail: string
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
      ],
    },
  })
}

export function registerHHCommands() {
  const state: State = {
    autoCron: null,
    awaitingEmail: false,
    awaitingPassword: false,
    awaitingQuery: false,
    awaitingMax: false,
    awaitingOTP: false,
    tempEmail: '',
  }

  bot.onText(/\/hhstart/, (msg) => {
    triggerHHStart(msg.chat.id)
  })

  // Инлайн кнопки
  bot.on('callback_query', async (query) => {
    if (!query.message)
      return
    const chatId = query.message.chat.id

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
          // const result = await applyToJobs({ query: state.searchQuery, maxApplies: state.maxApplies }, { bot, chatId, msg })
          // await bot.sendMessage(chatId, `✅ Откликнулся на ${result.applied.length} вакансий`)
        })
        await bot.sendMessage(chatId, '✅ Авто включён (пн-пт, 10:00)')
        break

      case 'hh_auto_stop':
        state.autoCron?.stop()
        state.autoCron = null
        await bot.sendMessage(chatId, '⛔ Авто остановлен')
        break
    }
  })

  bot.on('message', async (msg) => {
    const chatId = msg.chat.id

    if (!msg.text || msg.text.startsWith('/'))
      return

    const user = await prisma.user.findUnique({
      where: { telegramId: chatId },
      include: { Settings: true },
    })

    if (state.awaitingEmail) {
      if (!user?.hhEmail) {
        state.tempEmail = msg.text
      }
      else {
        state.tempEmail = user?.hhEmail
      }

      state.awaitingEmail = false

      await bot.deleteMessage(chatId, msg.message_id).catch(() => {
      })

      await bot.sendMessage(chatId, '🔄 Логинюсь...')
      try {
        await bot.sendMessage(chatId, `${state.tempEmail}, ${msg.text}`)

        await login(state.tempEmail, chatId)
        await bot.sendMessage(chatId, '✅ Авторизован! Куки сохранены.')

        await prisma.user.update({
          where: { telegramId: chatId },
          data: {
            hhEmail: state.tempEmail,
          },
        })

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
        data: {
          searchQuery: msg.text,
        },
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
        data: {
          maxApplies: num,
        },
      })
      await bot.sendMessage(chatId, `✅ Макс откликов: ${updated.maxApplies}`)
    }
  })
}
