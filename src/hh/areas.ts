export interface HhArea {
  code: string | null
  label: string
}

export const HH_AREAS: HhArea[] = [
  { code: null, label: '🌍 Весь мир' },
  { code: '113', label: '🇷🇺 Россия' },
  { code: '1', label: '🏙 Москва' },
  { code: '2', label: '🌊 Санкт-Петербург' },
]

export function areaLabel(code: string | null | undefined): string {
  return HH_AREAS.find(a => a.code === (code ?? null))?.label ?? '🌍 Весь мир'
}
