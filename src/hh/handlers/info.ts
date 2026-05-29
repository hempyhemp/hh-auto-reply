import bot from '@bot'
import prisma from '@prisma'
import { checkIsAuth } from '../scraper.js'
import { getState } from '../state.js'
import { escapeHtml } from '../ui.js'

export async function handleStatus(chatId: number): Promise<void> {
  const state = getState(chatId)
  const settings = await prisma.settings.findUnique({ where: { telegramId: chatId } })
  const isAuth = await checkIsAuth(chatId)
  await bot.sendMessage(
    chatId,
    `⚙️ Настройки:\n\nЗапрос: ${settings?.searchQuery ?? '--'}\nМакс откликов: ${settings?.maxApplies ?? '--'}\nАвто: ${state.autoCron ? '✅ включено' : '❌ выключено'}\nАвторизован: ${isAuth ? '✅' : '❌'}`,
    { reply_markup: { inline_keyboard: [] } },
  )
}

export async function handleSkipped(chatId: number): Promise<void> {
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
    reply_markup: { inline_keyboard: [] },
  })
}
