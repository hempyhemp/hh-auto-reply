import type { ResumeListItem } from './types.js'
import type { ScheduledTask } from 'node-cron'

export interface UserState {
  autoCron: ScheduledTask | null
  isApplying: boolean
  awaitingEmail: boolean
  awaitingPhone: boolean
  awaitingQuery: boolean
  awaitingMax: boolean
  awaitingPrompt: boolean
  pendingResumes: ResumeListItem[]
  loginMethodMsgId: number | null
  loginPromptMessageId: number | null
  queryPromptMessageId: number | null
  maxPromptMessageId: number | null
  promptPromptMessageId: number | null
  onboardingStep: 'max' | 'query' | 'resume_mode' | 'prompt' | null
  onboardingMsgId: number | null
  onboardingAfterResume: boolean
}

function makeUserState(): UserState {
  return {
    autoCron: null,
    isApplying: false,
    awaitingEmail: false,
    awaitingPhone: false,
    awaitingQuery: false,
    awaitingMax: false,
    awaitingPrompt: false,
    pendingResumes: [],
    loginMethodMsgId: null,
    loginPromptMessageId: null,
    queryPromptMessageId: null,
    maxPromptMessageId: null,
    promptPromptMessageId: null,
    onboardingStep: null,
    onboardingMsgId: null,
    onboardingAfterResume: false,
  }
}

const states = new Map<number, UserState>()

export function getState(chatId: number): UserState {
  if (!states.has(chatId))
    states.set(chatId, makeUserState())
  return states.get(chatId)!
}
