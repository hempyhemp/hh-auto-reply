import process from 'node:process'
import { createOpencode, createOpencodeClient } from '@opencode-ai/sdk'
// import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// export const claude = new Anthropic({
//   apiKey: process.env.ANTHROPIC_API_KEY,
// })

const OPENCODE_URL = 'http://127.0.0.1:4096'

let _client: ReturnType<typeof createOpencodeClient> | null = null

async function getClient() {
  if (_client)
    return _client

  // Если сервер уже запущен (напр. после хот-релоада) — просто подключаемся
  try {
    const existing = createOpencodeClient({ baseUrl: OPENCODE_URL })
    await existing.session.list()
    _client = existing
    return _client
  }
  catch {}

  // Иначе стартуем новый сервер
  const oc = await createOpencode({
    hostname: '127.0.0.1',
    port: 4096,
    config: {
      model: 'openrouter/deepseek/deepseek-v4-flash',
      provider: {
        openrouter: {
          options: { apiKey: process.env.OPENROUTER_API_KEY },
        },
      },
      agent: {
        build: { tools: { '*': false } },
      },
    },
  })
  _client = oc.client
  return _client
}

export const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

export async function test() {
  const client = createOpencodeClient({
    baseUrl: 'http://localhost:4096',
  })

  const test = await client.config.providers()
  console.log(test.data)
}

export async function askLLM(userMessage: string) {
  const client = await getClient()
  console.log('askLLM')
  // Создаём сессию
  const session = await client.session.create({
    body: { title: 'My request' },
  })

  // console.log('session: ', session.data)

  const result = await client.session.prompt({
    path: { id: session.data!.id },
    body: {
      parts: [{ type: 'text', text: userMessage }],
    },
  })

  // console.log('result: ', result.data)

  const textPart = result.data?.parts?.find((p: { type: string }) => p.type === 'text') as { type: 'text', text: string } | undefined
  // console.log(textPart?.text ?? '')
  return textPart?.text ?? ''
}

export async function createMessage(resume: string, message: string, prompt?: string) {
  const client = await getClient()

  console.log('[createMessage] client.instance: ', !!client.instance)
  const session = await client.session.create({ body: { title: 'Cover letter' } })
  const sessionId = session.data!.id

  console.log('[createMessage] sessionId: ', sessionId)

  const finalPromt = prompt || 'Ты — помощник по написанию сопроводительных писем. Отвечай только текстом самого письма, без вступлений, ремарок и пояснений. Опирайся на резюме и ничего не выдумывай, чего недостаточно в резюме лучше умолчать. Пиши по короче и простыми словами. В конце письма оставляй все контакты для связи.'

  const resumePreview = resume.slice(0, 200).replace(/\n/g, ' ')
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`[LLM] 📋 Prompt 1 (system + resume, noReply)`)
  console.log(`[LLM] system: ${finalPromt.slice(0, 80)}…`)
  console.log(`[LLM] resume: ${resumePreview}…`)
  console.log(`${'─'.repeat(60)}`)

  await client.session.prompt({
    path: { id: sessionId },
    body: {
      noReply: true,
      parts: [{ type: 'text', text: `${finalPromt}\n Резюме:\n${resume}` }],
    },
  })

  const vacancyPreview = message.slice(0, 300).replace(/\n/g, ' ')
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`[LLM] 📝 Prompt 2 (vacancy) → ожидаю ответ…`)
  console.log(`[LLM] vacancy: ${vacancyPreview}…`)
  console.log(`${'─'.repeat(60)}`)

  // ${prompt}\n\n
  const result = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: 'text', text: `Вакансия:\n${message}` }],
    },
  })

  const parts = (result.data?.parts ?? []) as { type: string, text?: string }[]
  const textPart = parts.find(p => p.type === 'text')
  console.log(`\n${'─'.repeat(60)}`)
  console.log(`[LLM] ✅ Ответ получен (${textPart?.text?.length ?? 0} символов)`)
  console.log(`[LLM] ${textPart?.text?.slice(0, 150).replace(/\n/g, ' ') ?? 'null'}…`)
  console.log(`${'─'.repeat(60)}\n`)

  try {
    await client.session.delete({ path: { id: sessionId } })
  }
  catch (e) {
    console.error('[Session cleanup error]:', (e as Error).message)
  }

  return textPart?.text ?? null
}

export async function askGPT(resume: string, message: string, prompt: string) {
  // return 'test'

  const res = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: `${prompt} ${resume}` },
      { role: 'user', content: message },
    ],
  })

  return res.choices[0].message.content
}
