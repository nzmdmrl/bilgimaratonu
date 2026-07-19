import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import HeaderWrapper from '@/components/HeaderWrapper'
import Footer from '@/components/Footer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bilgi Maratonu — Bil, Kazan, Şampiyon Ol!',
  description: 'Türkiye\'nin en eğlenceli online bilgi yarışması. 128 kişilik maraton turnuvaları, 1v1 düellolar.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body className={inter.className}>
        <HeaderWrapper />
        {children}
        <Footer />
      </body>
    </html>
  )
}
