import type { ResumeListItem } from './types.js'
import type { ScheduledTask } from 'node-cron'

export interface UserState {
  autoCron: ScheduledTask | null
  awaitingEmail: boolean
  awaitingQuery: boolean
  awaitingMax: boolean
  awaitingPrompt: boolean
  pendingResumes: ResumeListItem[]
  loginPromptMessageId: number | null
  queryPromptMessageId: number | null
  maxPromptMessageId: number | null
  promptPromptMessageId: number | null
}

function makeUserState(): UserState {
  return {
    autoCron: null,
    awaitingEmail: false,
    awaitingQuery: false,
    awaitingMax: false,
    awaitingPrompt: false,
    pendingResumes: [],
    loginPromptMessageId: null,
    queryPromptMessageId: null,
    maxPromptMessageId: null,
    promptPromptMessageId: null,
  }
}

const states = new Map<number, UserState>()

export function getState(chatId: number): UserState {
  if (!states.has(chatId))
    states.set(chatId, makeUserState())
  return states.get(chatId)!
}
