'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store'
import Link from 'next/link'

export default function GirisPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const { login, loading } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  const handleGoogleLogin = async (response: any) => {
    try {
      const res = await fetch('https://api.bilgimaratonu.com/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: response.credential }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Google girişi başarısız')
      localStorage.setItem('access_token', data.access_token)
      localStorage.setItem('refresh_token', data.refresh_token)
      await useAuthStore.getState().fetchMe()
      router.push('/')
    } catch (err: any) {
      setError(err.message || 'Google girişi başarısız.')
    }
  }

  useEffect(() => {
    (window as any).handleGoogleLogin = handleGoogleLogin
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      router.push('/')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Giriş başarısız.')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">
            <span style={{ color: '#FFD700' }}>Bilgi</span>
            <span style={{ color: '#4FC3F7' }}> Maratonu</span>
          </h1>
          <p style={{ color: '#B0BEC5' }}>Bil, Kazan, Şampiyon Ol!</p>
        </div>

        {/* Form */}
        <div className="glass p-8">
          <h2 className="text-2xl font-bold mb-6 text-center">Giriş Yap</h2>

          {error && (
            <div className="bg-red-500/20 border border-red-500/50 text-red-300 p-3 rounded-lg mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-2" style={{ color: '#B0BEC5' }}>E-posta</label>
              <input
                type="email"
                className="input-field"
                placeholder="ornek@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm mb-2" style={{ color: '#B0BEC5' }}>Şifre</label>
              <input
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn-primary w-full mt-2"
              disabled={loading}
            >
              {loading ? 'Giriş yapılıyor...' : 'Giriş Yap'}
            </button>
          </form>

          <div className="mt-4">
            <div className="relative flex items-center my-4">
              <div className="flex-grow border-t border-gray-700"></div>
              <span className="mx-3 text-sm" style={{ color: '#B0BEC5' }}>veya</span>
              <div className="flex-grow border-t border-gray-700"></div>
            </div>
            <div
              id="g_id_onload"
              data-client_id="567100837956-svlujc1p8tskl8j49p9gnu43hg1l2e7j.apps.googleusercontent.com"
              data-callback="handleGoogleLogin"
              data-auto_prompt="false"
            ></div>
            <div
              className="g_id_signin"
              data-type="standard"
              data-size="large"
              data-theme="filled_black"
              data-text="signin_with"
              data-shape="rectangular"
              data-logo_alignment="left"
              data-width="100%"
            ></div>
          </div>

          <p className="text-center mt-6" style={{ color: '#B0BEC5' }}>
            Hesabın yok mu?{' '}
            <Link href="/kayit" style={{ color: '#4FC3F7' }} className="font-semibold hover:underline">
              Kayıt Ol
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
