import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'


export const claude = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
})

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
