import bot from '@bot'

export async function debugFunc(chatId: number): Promise<void> {
  await bot.sendMessage(chatId, '🌍 Регион — скоро будет доступно')
  // await startOnboarding(chatId)
}
