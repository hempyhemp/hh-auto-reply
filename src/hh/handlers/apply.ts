import bot from '@bot'
import prisma from '@prisma'
import { applyToJobs } from '../scraper.js'
import { createStatusReporter, escapeHtml } from '../ui.js'

export async function handleApply(chatId: number): Promise<void> {
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
