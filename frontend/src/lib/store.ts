import { create } from 'zustand'
import api from './api'

interface User {
  id: string
  username: string
  email: string
  xp: number
  avatar_url?: string
  elo_rating: number
  trust_level: number
  role: string
  total_matches: number
  total_wins: number
  total_losses: number
  solo_stars?: number
}

interface AuthStore {
  user: User | null
  loading: boolean
  authReady: boolean          // fetchMe tamamlandı mı (ilk yükleme flaşını önlemek için)
  setUser: (user: User | null) => void
  login: (email: string, password: string) => Promise<void>
  register: (username: string, email: string, password: string) => Promise<void>
  logout: () => void
  fetchMe: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  loading: false,
  authReady: false,

  setUser: (user) => set({ user }),

  login: async (email, password) => {
    set({ loading: true })
    try {
      const res = await api.post('/api/auth/login', { email, password })
      localStorage.setItem('access_token', res.data.access_token)
      localStorage.setItem('refresh_token', res.data.refresh_token)
      const me = await api.get('/api/auth/me')
      set({ user: me.data, loading: false, authReady: true })
    } catch (e) {
      set({ loading: false })
      throw e
    }
  },

  register: async (username, email, password) => {
    set({ loading: true })
    try {
      const res = await api.post('/api/auth/register', { username, email, password })
      localStorage.setItem('access_token', res.data.access_token)
      localStorage.setItem('refresh_token', res.data.refresh_token)
      const me = await api.get('/api/auth/me')
      set({ user: me.data, loading: false, authReady: true })
    } catch (e) {
      set({ loading: false })
      throw e
    }
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null })
    window.location.href = '/giris'
  },

  fetchMe: async () => {
    if (typeof window === 'undefined') return
    const token = localStorage.getItem('access_token')
    if (!token) { set({ user: null, authReady: true }); return }
    try {
      const me = await api.get('/api/auth/me')
      set({ user: me.data, authReady: true })
    } catch {
      set({ user: null, authReady: true })
    }
  },
}))
