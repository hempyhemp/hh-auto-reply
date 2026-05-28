import process from 'node:process'
import prisma from '@prisma'
import { type Browser, chromium, type Page } from 'playwright'
import { config } from '@/config.js'

class Semaphore {
  private running = 0
  private readonly queue: Array<() => void> = []

  constructor(private readonly max: number) {}

  private acquire(): Promise<void> {
    if (this.running < this.max) {
      this.running++
      return Promise.resolve()
    }
    return new Promise(resolve => this.queue.push(resolve))
  }

  private release(): void {
    this.running--
    const next = this.queue.shift()
    if (next) {
      this.running++
      next()
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire()
    try {
      return await fn()
    }
    finally {
      this.release()
    }
  }

  get stats() {
    return { running: this.running, queued: this.queue.length, max: this.max }
  }
}

export const browserQueue = new Semaphore(config.maxConcurrentBrowsers)

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

export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  return browserQueue.run(async () => {
    const browser = await getBrowser()
    try {
      return await fn(browser)
    }
    finally {
      await browser.close()
    }
  })
}
