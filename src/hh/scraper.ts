import type { Message } from 'node-telegram-bot-api'
import type { Page } from 'playwright'
import type { ApplyOptions, ApplyResult, ResumeListItem, VacancyRef } from './types.js'
import type { StatusReporter } from './ui.js'
import bot from '@bot'
import prisma from '@prisma'
import { createMessage } from '@/openai'
import { loadSession, newStealthContext, randomDelay, randomScroll, withBrowser } from './browser.js'
import { createStatusReporter, escapeHtml } from './ui.js'

export class NoResumeError extends Error {
  constructor() {
    super('no_resume')
    this.name = 'NoResumeError'
  }
}

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

const APPLY_OUTCOME_SELECTOR = [
  '[data-qa="employer-asking-for-test"]',
  '[data-qa="task-body"]',
  '[data-qa="vacancy-response-popup-form-letter-input"]',
  '[data-qa="vacancy-response-submit-popup"]',
  '[data-qa="vacancy-response-letter-submit"]',
  '[data-qa="vacancy-response-letter-toggle"]',
  '[data-qa="textarea-wrapper"]',
].join(', ')

async function skipIfQuestionnaire(
  page: Page,
  vacancy: { title: string, href: string },
  ref: VacancyRef,
  chatId: number,
  status: (msg: string) => Promise<void>,
  results: ApplyResult,
): Promise<boolean> {
  await page.waitForSelector(APPLY_OUTCOME_SELECTOR, { timeout: 5000 }).catch(() => {})
  const hasQuestionnaire = await page.$('[data-qa="employer-asking-for-test"], [data-qa="task-body"]')
  if (!hasQuestionnaire)
    return false
  const { keep } = createStatusReporter(chatId)
  await keep(`Пропущена вакансия: ${vacancy.title}`)
  console.log(`[x] ${vacancy.title} hasQuestionnaire`)
  await prisma.skippedVacancy.upsert({
    where: { telegramId_href: { telegramId: chatId, href: vacancy.href } },
    create: { telegramId: chatId, href: vacancy.href, title: vacancy.title },
    update: {},
  })
  results.skipped.push(ref)
  return true
}

export async function login(email: string, chatId: number): Promise<void> {
  await withBrowser(async (browser) => {
    if (!browser.version()) {
      console.log('browser error')
      return
    }

    const context = await newStealthContext(browser)
    const page = await context.newPage()

    await page.goto('https://hh.ru/account/login', { waitUntil: 'domcontentloaded' })

    await page.click('[data-qa="submit-button"]')
    await page.waitForTimeout(randomDelay())

    await page.click('label:has([data-qa="credential-type-EMAIL"])')
    await page.waitForTimeout(randomDelay())

    await page.fill('[data-qa="applicant-login-input-email"]', email)
    await page.waitForTimeout(randomDelay())

    await page.click('[data-qa="submit-button"]')
    await page.waitForTimeout(randomDelay())

    await bot.sendMessage(chatId, '🔑 Введи код из email')
    await page.waitForTimeout(randomDelay())

    await page.click('[data-qa="applicant-login-input-otp"]')
    const otp = await waitForOtp(chatId)
    await page.fill('[data-qa="applicant-login-input-otp"] input', otp)

    await page.waitForTimeout(randomDelay())
    await page.waitForSelector('[data-qa="profileAndResumes-button"]', { timeout: 15000 })

    const cookies = await context.cookies()
    await prisma.user.upsert({
      where: { telegramId: chatId },
      update: { session: JSON.stringify(cookies, null, 2) },
      create: { telegramId: chatId, session: JSON.stringify(cookies, null, 2), Settings: { create: {} } },
    })

    await bot.sendMessage(chatId, cookies.length > 0 ? '✅ Авторизация выполнена' : '❌ Произошла ошибка')
  })
}

export async function checkIsAuth(telegramId: bigint | number) {
  return withBrowser(async (browser) => {
    const context = await newStealthContext(browser)
    const page = await context.newPage()
    await loadSession(page, telegramId)
    await page.goto('https://hh.ru/search/vacancy', { waitUntil: 'domcontentloaded' })
    try {
      return await page.waitForSelector('[data-qa="profileAndResumes-button"]', { timeout: 5000 })
    }
    catch {
      return null
    }
  })
}

export async function listResumes(chatId: number): Promise<ResumeListItem[]> {
  return withBrowser(async (browser) => {
    const context = await newStealthContext(browser)
    const page = await context.newPage()
    await loadSession(page, chatId)

    let lastError: Error | null = null
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.goto('https://hh.ru/applicant/resumes', { waitUntil: 'domcontentloaded' })
        const finalUrl = page.url()
        if (finalUrl.includes('/profile/resume/professional_role')) {
          throw new NoResumeError()
        }
        if (!finalUrl.includes('/applicant/resumes')) {
          throw new Error(`Session expired or redirected: ${finalUrl}`)
        }
        await page.waitForSelector('[data-qa^="resume-card-link-"]', { timeout: 10000 })

        const cardLinks = await page.$$('[data-qa^="resume-card-link-"]')

        let items: ResumeListItem[]
        if (cardLinks.length > 1) {
          items = await page.$$eval(
            '[data-qa^="resume-card-link-"]',
            links => links.map((a) => {
              const card = a.parentElement
              const titleEl = card?.querySelector('[data-qa="resume-title"]') ?? card?.querySelector('[data-qa="title"]')
              // console.log(titleEl)
              return {
                href: (a as HTMLAnchorElement).getAttribute('href') ?? '',
                title: titleEl?.innerText?.trim() ?? '(Ошибка в получении названия)',
              }
            }),
          )

          console.log(items.length)
        }
        else {
          const href = await cardLinks[0].getAttribute('href') ?? ''
          const titleEl = await page.$('[data-qa="resume-title"] h3') ?? await page.$('[data-qa="title"]')
          const title = (await titleEl?.innerText())?.trim() ?? '(без названия)'
          items = [{ href, title }]
        }

        const hhIds = items.map(item => new URL(`https://hh.ru${item.href}`).pathname.split('/').pop()!)

        await prisma.resume.deleteMany({ where: { telegramId: chatId, id: { notIn: hhIds } } })

        const settings = await prisma.settings.findUnique({ where: { telegramId: chatId } })
        if (settings?.selectedResumeId && !hhIds.includes(settings.selectedResumeId)) {
          await prisma.settings.update({ where: { telegramId: chatId }, data: { selectedResumeId: null } })
        }

        for (const item of items) {
          const id = new URL(`https://hh.ru${item.href}`).pathname.split('/').pop()!
          const resumeUrl = `https://hh.ru/resume_converter/resume.txt?hash=${id}&type=txt&hhtmFrom=&hhtmSource=resume`
          await page.goto(resumeUrl, { waitUntil: 'load' })
          try {
            const data = await page.locator('.resume').innerText()
            await prisma.resume.upsert({
              where: { id },
              create: { data, id, telegramId: chatId, title: item.title },
              update: { data, title: item.title },
            })
          }
          catch (e) {
            console.log(`Failed to fetch resume text for ${item.title}:`, e)
          }
        }

        console.log(items)
        return items
      }
      catch (e) {
        if (e instanceof NoResumeError)
          throw e
        lastError = e as Error
        if (attempt < 2)
          await page.waitForTimeout(4000)
      }
    }

    throw lastError!
  })
}

export async function saveResume(chatId: number, resumeItem: ResumeListItem): Promise<void> {
  const id = new URL(`https://hh.ru${resumeItem.href}`).pathname.split('/').pop()!
  await prisma.settings.update({
    where: { telegramId: chatId },
    data: { selectedResumeId: id },
  })
}

export async function applyToJobs(
  { query, area = 1, maxApplies = 10 }: ApplyOptions,
  { chatId, reporter }: { chatId: number, reporter: StatusReporter },
): Promise<ApplyResult> {
  return withBrowser(async (browser) => {
    const context = await newStealthContext(browser)
    const page = await context.newPage()
    const results: ApplyResult = { applied: [], skipped: [], errors: [] }
    const { status, keep, clear } = reporter

    await loadSession(page, chatId)

    const url = `https://hh.ru/search/vacancy?text=${encodeURIComponent(query)}&area=${area}`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-qa="serp-item__title"]', { timeout: 10000 }).catch(() => null)

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

    await keep(`✅ Вакансий найдено: ${vacancies.length}`)

    const resumes = await prisma.resume.findMany({ where: { telegramId: chatId } })
    const settings = await prisma.settings.findUnique({ where: { telegramId: chatId } })
    const resume = resumes.find(r => r.id === settings?.selectedResumeId) ?? resumes[0]
    const user = await prisma.user.findUnique({ where: { telegramId: chatId } })

    if (!resume?.data) {
      await keep('❌ Резюме не выбрано — выбери резюме через меню')
      return results
    }

    const knownSkipped = new Set(
      (await prisma.skippedVacancy.findMany({ where: { telegramId: chatId }, select: { href: true } }))
        .map(v => v.href),
    )

    let appliedCount = 0
    for (const vacancy of vacancies) {
      if (appliedCount >= maxApplies)
        break
      const ref: VacancyRef = { title: vacancy.title, href: vacancy.href }

      if (knownSkipped.has(vacancy.href)) {
        continue
      }

      try {
        await keep(`🔄 Обрабатывается: ${vacancy.title}`)
        await page.goto(vacancy.href, { waitUntil: 'domcontentloaded' })
        await page.waitForSelector('[data-qa="vacancy-description"]', { timeout: 10000 }).catch(() => null)

        const description = await page
          .locator('[data-qa="vacancy-description"]')
          .innerText()
          .catch(() => '')

        if (!description) {
          results.skipped.push(ref)
          continue
        }

        const applyBtn = await page.$('[data-qa="vacancy-response-link-top"]')
        if (!applyBtn) {
          results.skipped.push(vacancy)
          continue
        }

        await randomScroll(page)

        await applyBtn.click()

        if (await skipIfQuestionnaire(page, vacancy, ref, chatId, status, results))
          continue

        // console.log('[LetterDebug]:', '\nresume: ', resume.data, '\ndescription: ', description, '\nprompt: ', user!.prompt)
        await keep(`✍️ Генерирую письмо: ${vacancy.title}`)
        const letterPromise = Promise.race([
          createMessage(resume.data, description, user!.prompt),
          new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('Letter generation timeout (60s)')), 80000),
          ),
        ]).catch((err: Error) => {
          console.error('[Letter Error]:', err.message)
          return null
        })

        if (resumes.length > 1) {
          // Выбор резюме
          const currentResumeEl = await page.$('[data-qa="resume-title"]')
          const currentResumeTitle = (await currentResumeEl?.innerText())?.trim() ?? ''
          console.log('Текущее резюме на странице:', currentResumeTitle)
          console.log('Ожидаемое резюме из БД:', resume.title)

          if (currentResumeTitle !== resume.title) {
            console.log('Резюме не совпадает, нужно сменить')
            await currentResumeEl?.click()
            await page.waitForSelector('[data-qa="magritte-select-option-list"]', { timeout: 5000 })
            // await page.pause()
            const options = await page.$$('label[role="option"]')
            for (const option of options) {
              const titleEl = await option.$('[data-qa="resume-title"] [data-qa="cell-text-content"]')
              const title = (await titleEl?.innerText())?.trim()
              if (title === resume.title) {
                await option.click()
                await page.waitForTimeout(randomDelay())
                break
              }
            }
          }
          // await page.pause()

          const addLetter = await page.$('[data-qa="add-cover-letter"]')

          if (addLetter) {
            await addLetter?.hover()
            await addLetter?.click()
          }
          const letter = await letterPromise
          if (letter) {
            await keep(`✅ <b>${escapeHtml(vacancy.title)}</b>\n\n${escapeHtml(letter)}`)
            const letterInput = await page.$('[data-qa="vacancy-response-popup-form-letter-input"]')

            await letterInput?.click()
            await letterInput?.fill(letter)
            // await page.pause()
          }
          else {
            await keep(`Письмо не сгенерировано, ошибка`)
          }

          await page.waitForTimeout(randomDelay())

          const submitBtn = await page.$('[data-qa="vacancy-response-submit-popup"]')// vacancy-response-popup-submit
          if (submitBtn) {
            await submitBtn.click()
            await page.waitForTimeout(randomDelay())
          }
          else {
            const errMsg = 'Not found submit button'
            console.log(errMsg)
            results.errors.push({ ...ref, message: errMsg })
            // results.skipped.push(vacancy)
            continue
          }
        }
        else {
          console.log(`[Debug]: single flow: ${chatId}`)

          const letter = await letterPromise

          if (letter) {
            await keep(`✅ <b>${escapeHtml(vacancy.title)}</b>\n\n${escapeHtml(letter)}`)

            const LETTER_SELECTORS = [
              '[data-qa="textarea-wrapper"] textarea',
              '[data-qa="vacancy-response-popup-form-letter-input"]',
              '[data-qa="textarea-native-wrapper"] textarea',
            ]

            await page.waitForSelector(LETTER_SELECTORS.join(', '), { timeout: 10000 }).catch(() => {})

            let letterInput = null
            for (const sel of LETTER_SELECTORS) {
              letterInput = await page.$(sel)
              if (letterInput)
                break
            }
            await letterInput?.click()
            await letterInput?.fill(letter, { force: true })
          }

          const submitBtn = await page.$('[data-qa="vacancy-response-letter-submit"]') ?? await page.$('[data-qa="vacancy-response-submit-popup"]')// vacancy-response-popup-submit
          // await page.pause()
          if (submitBtn) {
            await submitBtn.click()
            await page.waitForTimeout(randomDelay())
          }
          else {
            const errMsg = 'Not found submit button'
            console.log(errMsg)
            results.errors.push({ ...ref, message: errMsg })
          }
        }

        results.applied.push(ref)
        appliedCount++
      }
      catch (err) {
        results.errors.push({ ...ref, message: (err as Error).message })
      }
    }

    // await clear()

    return results
  })
}
