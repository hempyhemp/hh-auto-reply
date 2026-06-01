import type { Logger } from './logger.js'

declare global {
  function createLogger(tag: string): Logger
}

export {}
