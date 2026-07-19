import Link from 'next/link'

const PAGES = [
  { href: '/blog', label: 'Blog' },
  { href: '/sayfa/hakkimizda', label: 'Hakkımızda' },
  { href: '/sayfa/kullanici-sozlesmesi', label: 'Kullanıcı Sözleşmesi' },
  { href: '/sayfa/gizlilik-politikasi', label: 'Gizlilik Politikası' },
  { href: '/sayfa/cerez-politikasi', label: 'Çerez Politikası' },
  { href: '/sayfa/iletisim', label: 'İletişim' },
]

export default function Footer() {
  return (
    <footer className="mt-16 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-wrap gap-4 justify-center mb-4">
          {PAGES.map((p, i) => (
            <Link key={i} href={p.href}
              className="text-sm hover:underline transition-colors"
              style={{ color: '#555' }}>
              {p.label}
            </Link>
          ))}
        </div>
        <p className="text-center text-xs" style={{ color: '#333' }}>
          © {new Date().getFullYear()} Bilgi Maratonu. Tüm hakları saklıdır.
        </p>
      </div>
    </footer>
  )
}
