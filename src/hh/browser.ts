import process from 'node:process'
import prisma from '@prisma'
import { type Browser, chromium, type Page } from 'playwright'

export function randomDelay(min = 300, max = 2000): number {
  return min + Math.random() * (max - min)
}

export async function humanDelay(min = 300, max = 2000): Promise<void> {
  return new Promise(r => setTimeout(r, randomDelay(min, max)))
}

export async function randomScroll(page: Page): Promise<void> {
  await page.mouse.move(100 + Math.random() * 500, 200 + Math.random() * 500)
  await page.mouse.wheel(0, 300 + Math.random() * 1000)
}

export async function getBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: !process.env.debug,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
    ],
  })
}

export async function newStealthContext(browser: Browser) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  })
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })
  return context
}

export async function loadSession(page: Page, telegramId: bigint | number): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { telegramId } })
  if (!user?.session)
    return false
  await page.context().addCookies(JSON.parse(user.session))
  return true
}
