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
  return chromium.launch({ headless: false })
}

export async function loadSession(page: Page, telegramId: bigint | number): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { telegramId } })
  if (!user?.session)
    return false
  await page.context().addCookies(JSON.parse(user.session))
  return true
}
