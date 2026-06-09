import bot from '@bot'
import prisma from '@prisma'
import { HH_AREAS, areaLabel } from '../areas.js'

export async function handleRegion(chatId: number): Promise<void> {
  const settings = await prisma.settings.findUnique({ where: { telegramId: chatId } })
  const current = settings?.area ?? null

  const buttons = HH_AREAS.map(({ code, label }) => [{
    text: code === current ? `✅ ${label}` : label,
    callback_data: `hh_area_${code ?? 'world'}`,
  }])

  await bot.sendMessage(
    chatId,
    `🌍 <b>Регион</b>\n\nТекущий: <b>${areaLabel(current)}</b>\n\nВыбери регион поиска:`,
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: buttons } },
  )
}

export async function handleAreaPick(chatId: number, messageId: number, rawCode: string): Promise<void> {
  const code = rawCode === 'world' ? null : rawCode
  await prisma.settings.update({ where: { telegramId: chatId }, data: { area: code } })
  await bot.deleteMessage(chatId, messageId).catch(() => {})
  await bot.sendMessage(chatId, `✅ Регион: <b>${areaLabel(code)}</b>`, { parse_mode: 'HTML' })
}
