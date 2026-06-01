const RESET = '\x1B[0m'
const BOLD = '\x1B[1m'
const DIM = '\x1B[2m'

const colors = {
  gray: '\x1B[97m',
  green: '\x1B[92m',
  yellow: '\x1B[93m',
  red: '\x1B[91m',
  cyan: '\x1B[96m',
  magenta: '\x1B[95m',
  blue: '\x1B[94m',
  white: '\x1B[97m',
}

const LEVELS = {
  info: { icon: '●', color: colors.cyan, label: 'INFO ' },
  success: { icon: '✔', color: colors.green, label: 'OK   ' },
  warn: { icon: '▲', color: colors.yellow, label: 'WARN ' },
  error: { icon: '✖', color: colors.red, label: 'ERROR' },
  debug: { icon: '◆', color: colors.magenta, label: 'DEBUG' },
  llm: { icon: '◈', color: colors.blue, label: 'LLM  ' },
} as const

type Level = keyof typeof LEVELS

function timestamp(): string {
  const now = new Date()
  const dd = String(now.getDate()).padStart(2, '0')
  const mo = String(now.getMonth() + 1).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  return `${DIM}${colors.gray}${dd}.${mo} ${hh}:${mm}${RESET}`
}

function formatTag(tag: string): string {
  return `${DIM}${colors.gray}[${tag}]${RESET}`
}

function formatArgs(args: unknown[]): string {
  return args
    .map(a =>
      typeof a === 'object' && a !== null
        ? JSON.stringify(a, null, 2)
        : String(a),
    )
    .join(' ')
}

function print(level: Level, tag: string, args: unknown[]): void {
  const { icon, color, label } = LEVELS[level]
  const parts = [
    timestamp(),
    `${color}${BOLD}${icon} ${label}${RESET}`,
    formatTag(tag),
    `${color}${formatArgs(args)}${RESET}`,
  ]
  if (level === 'error') {
    process.stderr.write(`${parts.join(' ')}\n`)
  }
  else {
    process.stdout.write(`${parts.join(' ')}\n`)
  }
}

export function createLogger(tag: string) {
  return {
    info: (...args: unknown[]) => print('info', tag, args),
    ok: (...args: unknown[]) => print('success', tag, args),
    warn: (...args: unknown[]) => print('warn', tag, args),
    error: (...args: unknown[]) => print('error', tag, args),
    debug: (...args: unknown[]) => print('debug', tag, args),
    llm: (...args: unknown[]) => print('llm', tag, args),
    divider: (label?: string) => {
      const line = '─'.repeat(58)
      const text = label
        ? `${DIM}${colors.gray}┌─ ${label} ${'─'.repeat(Math.max(0, 54 - label.length))}${RESET}`
        : `${DIM}${colors.gray}${line}${RESET}`
      process.stdout.write(`${text}\n`)
    },
  }
}

export type Logger = ReturnType<typeof createLogger>
