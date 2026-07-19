import { Metadata } from 'next'

async function getEvent(slug: string) {
  try {
    const res = await fetch(`https://api.bilgimaratonu.com/api/events/${slug}`, { cache: 'no-store' })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const event = await getEvent(params.slug)

  if (!event) {
    return { title: 'Test Bulunamadı — Bilgi Maratonu' }
  }

  const title = `${event.title} — Bilgi Maratonu`
  const description = event.description || `${event.question_count} soruluk ${event.title} testini çöz, skor tablosunda yerini al!`
  const url = `https://bilgimaratonu.com/testler/${params.slug}`

  // Gizli ve şifreli testler index edilmesin
  const robots = event.visibility === 'public'
    ? 'index, follow'
    : 'noindex, nofollow'

  return {
    title,
    description,
    robots,
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      siteName: 'Bilgi Maratonu',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default function TestLayout({ children }: { children: React.ReactNode }) {
  return children
}
