import bot from '@bot'
import prisma from '@prisma'
import { listResumes, NoResumeError, saveResume } from '../scraper.js'
import { getState } from '../state.js'
import { escapeHtml, NO_RESUME_MARKUP, safeEdit } from '../ui.js'

export async function handleResumeList(chatId: number): Promise<void> {
  const state = getState(chatId)
  const loadingMsg = await bot.sendMessage(chatId, '🔄 Загружаю список резюме...')

  let resumes
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

export async function handleMyResume(chatId: number): Promise<void> {
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
    { parse_mode: 'HTML', reply_markup: { inline_keyboard: [] } },
  )
}

export async function handleResumePick(chatId: number, messageId: number, idx: number): Promise<void> {
  const state = getState(chatId)
  const resume = state.pendingResumes[idx]
  if (!resume) {
    await safeEdit('❌ Резюме не найдено, попробуйте снова', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    })
    return
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
    reply_markup: { inline_keyboard: [] },
    // reply_markup: BACK_MARKUP,
  })
}
