export interface ApplyOptions {
  query: string
  area?: string
  maxApplies?: number
  searchMode?: 'text' | 'resume'
  resumeId?: string
}

export interface VacancyRef {
  title: string
  href: string
}

export interface ApplyResult {
  applied: VacancyRef[]
  skipped: VacancyRef[]
  errors: Array<VacancyRef & { message: string }>
  error?: string
}

export interface ResumeListItem {
  title: string
  href: string
}
