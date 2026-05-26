import { createOpencode } from '@opencode-ai/sdk'
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
      config: { model: 'anthropic/claude-3-5-sonnet-20241022' },
    })
    console.log(`OpenCode server running at ${_opencode.server.url}`)
  }
  return _opencode
}

export const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

export async function askOpenCode(resume: string, message: string, prompt: string) {
  const opencode = await getOpencode()
  const session = await opencode.client.session.create({})
  const sessionId = session.data?.id || '0'
  console.log('sessionId: ', sessionId)

  const result = await opencode.client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [
        { type: 'text', text: `${prompt}\n\n${resume}\n\n${message}` },
      ],
    },
  })

    console.log(result)

  const textPart = result.data?.parts?.find((p: { type: string }) => p.type === 'text') as { type: 'text', text: string } | undefined
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
