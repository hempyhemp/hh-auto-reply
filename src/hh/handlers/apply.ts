import bot from '@bot'
import prisma from '@prisma'
import { applyToJobs } from '../scraper.js'
import { APPLYING_REPLY_KEYBOARD, MAIN_REPLY_KEYBOARD, createStatusReporter, escapeHtml } from '../ui.js'
import { getState } from '../state.js'

export async function handleApply(chatId: number): Promise<void> {
  const settings = await prisma.settings.findUnique({ where: { telegramId: chatId } })
  if (!settings)
    return

  const state = getState(chatId)
  state.isApplying = true

  const reporter = createStatusReporter(chatId)
  const searchMode = (settings.searchMode ?? 'text') as 'text' | 'resume'
  const hasQuery = !!settings.searchQuery
  const searchLabel = searchMode === 'resume'
    ? (hasQuery ? `по запросу "${settings.searchQuery}" и резюме` : 'по резюме')
    : `по запросу "${settings.searchQuery}"`
  await bot.sendMessage(chatId, `🔄 Ищу вакансии ${searchLabel}...`, { reply_markup: APPLYING_REPLY_KEYBOARD })

  applyToJobs(
    { query: settings.searchQuery, maxApplies: settings.maxApplies, searchMode, resumeId: settings.selectedResumeId ?? undefined, area: settings.area ?? undefined, excludedWords: settings.excludedWords ?? undefined },
    { chatId, reporter },
  )
    .then(async (result) => {
      state.isApplying = false
      await bot.sendMessage(chatId, '✅ Готово', { reply_markup: MAIN_REPLY_KEYBOARD })
      if (result.error) {
        await bot.sendMessage(chatId, `❌ ${result.error}`)
        return
      }

      const lines: string[] = []
      const summaryLabel = searchMode === 'resume'
        ? (settings.searchQuery ? `запросу «${settings.searchQuery}» + резюме` : 'резюме')
        : `запросу «${settings.searchQuery}»`
      lines.push(`📊 <b>Итого по ${summaryLabel}</b>`)
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
    .catch(async () => {
      state.isApplying = false
      await bot.sendMessage(chatId, '❌ Ошибка при откликах', { reply_markup: MAIN_REPLY_KEYBOARD })
    })
}
