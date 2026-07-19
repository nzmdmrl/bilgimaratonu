import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Testler — Bilgi Maratonu',
  description: 'Bilgi Maratonu testlerini çöz, kendi testini oluştur, arkadaşlarınla yarış!',
  openGraph: {
    title: 'Testler — Bilgi Maratonu',
    description: 'Testleri çöz veya kendi testini oluştur.',
    type: 'website',
  },
}

export default function TestlerLayout({ children }: { children: React.ReactNode }) {
  return children
}
