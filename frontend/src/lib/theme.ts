// Tema yönetimi: gündüz / gece / otomatik (cihaz saatine göre)
export type ThemeMode = 'light' | 'dark' | 'auto'

const KEY = 'theme_mode'

export function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'auto') {
    try {
      const h = new Date().getHours()
      return h >= 7 && h < 19 ? 'light' : 'dark'   // 07:00–19:00 gündüz
    } catch {
      return 'dark'
    }
  }
  return mode
}

export function getMode(fallback: ThemeMode = 'dark'): ThemeMode {
  if (typeof window === 'undefined') return fallback
  const s = localStorage.getItem(KEY) as ThemeMode | null
  return s === 'light' || s === 'dark' || s === 'auto' ? s : fallback
}

export function hasUserChoice(): boolean {
  if (typeof window === 'undefined') return false
  return !!localStorage.getItem(KEY)
}

export function applyTheme(mode: ThemeMode) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', resolveTheme(mode))
}

export function setMode(mode: ThemeMode) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, mode)
  applyTheme(mode)
  window.dispatchEvent(new Event('themechange'))
}
