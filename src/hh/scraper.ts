import type { Message } from 'node-telegram-bot-api'
import type { ApplyOptions, ApplyResult, ResumeListItem, VacancyRef } from './types.js'
import type { StatusReporter } from './ui.js'
import bot from '@bot'
import prisma from '@prisma'
import { createMessage } from '../openai'
import { getBrowser, loadSession, randomDelay } from './browser.js'

function waitForOtp(chatId: number): Promise<string> {
  return new Promise((resolve) => {
    const handler = (msg: Message) => {
      if (msg.chat.id !== chatId || !msg.text)
        return
      bot.removeListener('message', handler)
      resolve(msg.text)
    }
    bot.on('message', handler)
  })
}

export async function login(email: string, chatId: number): Promise<void> {
  const browser = await getBrowser()
  // await bot.sendMessage(chatId, `Browser is connected: ${browser.isConnected()}`)
  if (!browser.version()) {
    console.log('browser error')
    return
  }

  const context = await browser.newContext()
  const page = await context.newPage()

  await page.goto('https://hh.ru/account/login', { waitUntil: 'networkidle' })
  // await bot.sendMessage(chatId, `page: ${page.url()}`)

  await page.click('[data-qa="submit-button"]')
  await page.waitForTimeout(randomDelay())
  // await bot.sendMessage(chatId, `Клик по "Войти"`)

  await page.click('label:has([data-qa="credential-type-EMAIL"])')
  await page.waitForTimeout(randomDelay())
  // await bot.sendMessage(chatId, `Клик по "Email"`)

  await page.fill('[data-qa="applicant-login-input-email"]', email)
  await page.waitForTimeout(randomDelay())
  // await bot.sendMessage(chatId, `Ввод "Email"`)

  await page.click('[data-qa="submit-button"]')
  // await bot.sendMessage(chatId, `Клик по "Дальше"`)
  await page.waitForTimeout(randomDelay())

  await bot.sendMessage(chatId, '🔑 Введи код из email')
  await page.waitForTimeout(randomDelay())

  await page.click('[data-qa="applicant-login-input-otp"]')
  const otp = await waitForOtp(chatId)
  await page.fill('[data-qa="applicant-login-input-otp"] input', otp)
  // await bot.sendMessage(chatId, `Введён ОТП: ${otp}`)

  await page.waitForTimeout(randomDelay())
  await page.waitForLoadState('networkidle')

  const cookies = await context.cookies()
  await prisma.user.update({
    where: { telegramId: chatId },
    data: { session: JSON.stringify(cookies, null, 2) },
  })

  await bot.sendMessage(chatId, cookies.length > 0 ? '✅ Авторизация выполнена' : '❌ Произошла ошибка')
  await browser.close()
}

export async function checkIsAuth(telegramId: bigint | number) {
  const browser = await getBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  await loadSession(page, telegramId)
  await page.goto('https://hh.ru/search/vacancy', { waitUntil: 'networkidle' })
  try {
    return await page.$('[data-qa="profileAndResumes-button"]')
  }
  catch (e) {
    return e
  }
}

export async function listResumes(chatId: number): Promise<ResumeListItem[]> {
  const browser = await getBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  await loadSession(page, chatId)

  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.goto('https://hh.ru/applicant/resumes', { waitUntil: 'networkidle' })
      const resumes = await page.$$eval(
        '[data-qa^="resume-card-link-"]',
        links => links.map(a => ({
          href: (a as HTMLAnchorElement).getAttribute('href') ?? '',
          title: a.textContent?.trim() ?? '(без названия)',
        })),
      )
      await browser.close()
      return resumes
    }
    catch (e) {
      lastError = e as Error
      if (attempt < 2)
        await page.waitForTimeout(4000)
    }
  }

  await browser.close()
  throw lastError!
}

export async function saveResume(chatId: number, resumeHref: string): Promise<string | undefined> {
  const browser = await getBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  await loadSession(page, chatId)

  const id = new URL(`https://hh.ru${resumeHref}`).pathname.split('/').pop()!
  const resumeUrl = `https://hh.ru/resume_converter/resume.txt?hash=${id}&type=txt&hhtmFrom=&hhtmSource=resume`

  await page.goto(resumeUrl, { waitUntil: 'networkidle' })

  let resume: string | undefined
  try {
    resume = await page.locator('.resume').innerText()
    await prisma.resume.upsert({
      where: { id },
      create: { data: resume, id, telegramId: chatId },
      update: { data: resume },
    })
  }
  catch (e) {
    console.log(e)
    await bot.sendMessage(chatId, 'Нет резюме на hh.ru, создайте')
  }
  finally {
    await browser.close()
  }

  return resume
}

export async function applyToJobs(
  { query, area = 1, maxApplies = 10 }: ApplyOptions,
  { chatId, reporter }: { chatId: number, reporter: StatusReporter },
): Promise<ApplyResult> {
  const browser = await getBrowser()
  const context = await browser.newContext()
  const page = await context.newPage()
  const results: ApplyResult = { applied: [], skipped: [], errors: [] }
  const { status, keep, clear } = reporter

  try {
    await loadSession(page, chatId)

    const url = `https://hh.ru/search/vacancy?text=${encodeURIComponent(query)}&area=${area}`
    await page.goto(url, { waitUntil: 'networkidle' })

    if (!await page.$('[data-qa="profileAndResumes-button"]')) {
      return { ...results, error: 'Не авторизован. Выполните login' }
    }

    await status('✅ Авторизация выполнена')

    const vacancies = await page.$$eval(
      '[data-qa="serp-item__title"]',
      links => links.map(a => ({
        href: (a as HTMLAnchorElement).href,
        title: a.textContent?.trim() ?? '',
      })),
    )

    await status(`✅ Вакансий найдено: ${vacancies.length}`)

    const resume = await prisma.resume.findFirst({ where: { telegramId: chatId } })
    const user = await prisma.user.findUnique({ where: { telegramId: chatId } })

    if (!resume?.data) {
      await keep('❌ Резюме не выбрано — выбери резюме через меню')
      return results
    }

    for (const vacancy of vacancies.slice(0, maxApplies)) {
      const ref: VacancyRef = { title: vacancy.title, href: vacancy.href }
      try {
        await status(`🔄 Обрабатывается: ${vacancy.title}`)
        await page.goto(vacancy.href, { waitUntil: 'networkidle' })

        const description = await page
          .locator('[data-qa="vacancy-description"]')
          .innerText()
          .catch(() => '')

        if (!description) {
          results.skipped.push(ref)
          continue
        }

        await status(`✍️ Генерирую письмо: ${vacancy.title}`)

        const letter = await createMessage(resume.data, description, user!.prompt)
        await keep(`✅ <b>${vacancy.title}</b>\n\n${letter}`)

        // const applyBtn = await page.$('[data-qa="vacancy-response-link-top"]')
        // if (!applyBtn) {
        //   results.skipped.push(vacancy.title)
        //   continue
        // }
        //
        // await randomScroll(page)
        //
        // await applyBtn.click()
        // await page.waitForTimeout(randomDelay())
        //
        // const submitBtn = await page.$('[data-qa="vacancy-response-popup-submit"]')
        // if (submitBtn) {
        //   await submitBtn.click()
        //   await page.waitForTimeout(randomDelay())
        // }

        results.applied.push(ref)
      }
      catch (err) {
        results.errors.push({ ...ref, message: (err as Error).message })
      }
    }

    await clear()
  }
  finally {
    await browser.close()
  }

  return results
}
