import { createOpencode, createOpencodeClient } from '@opencode-ai/sdk'
// import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'

// export const claude = new Anthropic({
//   apiKey: process.env.ANTHROPIC_API_KEY,
// })

let _opencode: Awaited<ReturnType<typeof createOpencode>> | null = null

async function getOpencode() {
  if (!_opencode) {
    _opencode = await createOpencode({
      hostname: '127.0.0.1',
      port: 4096,
      config: {
        model: 'openrouter/deepseek/deepseek-v4-flash',
        provider: {
          openrouter: {
            options: { apiKey: process.env.OPENROUTER_API_KEY },
          },
        },
      },
    })
  }
  return _opencode
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
  const oc = await getOpencode()
  const client = oc.client

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

export async function askOpenCode(resume: string, message: string, prompt: string) {
  const opencode = await getOpencode()

  const session = await opencode.client.session.create({})
  const sessionId = session.data?.id || '0'
  console.log('sessionId: ', sessionId)

  const result = await opencode.client.session.prompt({
    path: { id: sessionId },
    body: {
      model: {
        providerID: 'anthropic',
        modelID: 'claude-3-5-sonnet-20241022',
      },
      parts: [
        { type: 'text', text: `${prompt}\n\n${resume}\n\n${message}` },
      ],
    },
  })

  console.log(JSON.stringify(result?.data, null, 2))

  const parts = (result.data as any)?.parts ?? []
  const textPart = parts.find((p: { type: string }) => p.type === 'text') as { type: 'text', text: string } | undefined
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
