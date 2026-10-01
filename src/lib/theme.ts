import type { ThemeId } from '../types'

/** Косметика лише на клієнті (не в групових налаштуваннях сервера). */
export const THEME_STORAGE_KEY = 'excelcssi:theme'
export const THEME_IDS: ThemeId[] = ['light', 'dark', 'midnight']

export function isThemeId(v: unknown): v is ThemeId {
  return v === 'light' || v === 'dark' || v === 'midnight'
}

export function readStoredTheme(): ThemeId | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (isThemeId(v)) return v
    // міграція зі старого ключа
    const legacy = localStorage.getItem('dutyrank:theme')
    if (isThemeId(legacy)) {
      localStorage.setItem(THEME_STORAGE_KEY, legacy)
      return legacy
    }
    return null
  } catch {
    return null
  }
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
}

export function nextTheme(current: ThemeId): ThemeId {
  const i = THEME_IDS.indexOf(current)
  return THEME_IDS[(i + 1) % THEME_IDS.length]
}
