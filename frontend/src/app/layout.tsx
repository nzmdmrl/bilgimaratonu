import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import HeaderWrapper from '@/components/HeaderWrapper'
import Footer from '@/components/Footer'
import BottomNav from '@/components/BottomNav'
import ClickSound from '@/components/ClickSound'
import ThemeProvider from '@/components/ThemeProvider'

// İlk boyamadan önce temayı uygula (flash olmasın)
const themeInit = `try{var m=localStorage.getItem('theme_mode')||'dark';var t=m;if(m==='auto'){var h=new Date().getHours();t=(h>=7&&h<19)?'light':'dark';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','dark');}`

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Bilgi Maratonu — Bil, Kazan, Şampiyon Ol!',
  description: 'Türkiye\'nin en eğlenceli online bilgi yarışması. 128 kişilik maraton turnuvaları, 1v1 düellolar.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider />
        <HeaderWrapper />
        {children}
        <Footer />
        <BottomNav />
        <ClickSound />
      </body>
    </html>
  )
}
