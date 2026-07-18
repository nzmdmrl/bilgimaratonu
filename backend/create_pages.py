import asyncio

pages = [
    {
        'slug': 'hakkimizda',
        'title': 'Hakkımızda',
        'content': '<h2>Bilgi Maratonu Hakkında</h2><p>Bilgi Maratonu, Türkiye\'nin en eğlenceli bilgi yarışması platformudur. Gerçek zamanlı 1\'e 1 düellolar, solo pratik modları, haftalık ve aylık ligler ile bilgini test et!</p><h3>Neler Sunuyoruz?</h3><ul><li><strong>1v1 Maç:</strong> Gerçek rakiplerle anlık bilgi düellosu</li><li><strong>Solo Pratik:</strong> Kendi hızında pratik yap, XP kazan</li><li><strong>Testler:</strong> Hazır test setleriyle kendini sına</li><li><strong>Lig Sistemi:</strong> Günlük, aylık ve yıllık lig sıralamaları</li><li><strong>Maraton:</strong> 32 kişilik eleme turnuvaları</li></ul><h3>İletişim</h3><p>info@bilgimaratonu.com</p>'
    },
    {
        'slug': 'gizlilik-politikasi',
        'title': 'Gizlilik Politikası',
        'content': '<h2>Gizlilik Politikası</h2><p>Son güncelleme: Temmuz 2026</p><h3>Toplanan Bilgiler</h3><ul><li>Ad, e-posta ve kullanıcı adı</li><li>Oyun içi istatistikler</li><li>Oturum bilgileri</li></ul><h3>Bilgilerin Kullanımı</h3><p>Bilgileriniz yalnızca hizmet sunumu, güvenlik ve yasal yükümlülükler için kullanılır. Üçüncü taraflarla paylaşılmaz.</p><h3>Haklarınız</h3><p>KVKK kapsamında verilerinize erişim, düzeltme ve silme hakkına sahipsiniz. info@bilgimaratonu.com</p>'
    },
    {
        'slug': 'kullanici-sozlesmesi',
        'title': 'Kullanıcı Sözleşmesi',
        'content': '<h2>Kullanıcı Sözleşmesi</h2><p>Son güncelleme: Temmuz 2026</p><h3>Kullanıcı Yükümlülükleri</h3><ul><li>Gerçek bilgilerle kayıt olmak</li><li>Hesap güvenliğini korumak</li><li>Platformu yasal amaçlarla kullanmak</li><li>Hile veya bot kullanmamak</li></ul><h3>Yasaklı Davranışlar</h3><ul><li>Başkasının hesabını kullanmak</li><li>Hakaret veya taciz içeren içerik</li><li>Sistemi manipüle etmek</li></ul><h3>Hesap Askıya Alma</h3><p>Sözleşme ihlallerinde hesaplar önceden uyarı yapılmaksızın askıya alınabilir.</p>'
    },
    {
        'slug': 'cerez-politikasi',
        'title': 'Çerez Politikası',
        'content': '<h2>Çerez Politikası</h2><p>Çerezler, web siteleri tarafından tarayıcınıza kaydedilen küçük metin dosyalarıdır.</p><h3>Kullandığımız Çerezler</h3><ul><li><strong>Zorunlu Çerezler:</strong> Oturum yönetimi için gereklidir</li><li><strong>Tercih Çerezleri:</strong> Kullanıcı ayarlarını hatırlamak için kullanılır</li></ul><p>Tarayıcı ayarlarınızdan çerezleri yönetebilirsiniz.</p>'
    },
    {
        'slug': 'iletisim',
        'title': 'İletişim',
        'content': '<h2>İletişim</h2><p>Bilgi Maratonu ekibiyle iletişime geçmek için:</p><h3>E-posta</h3><p>info@bilgimaratonu.com</p><h3>Geri Bildirim</h3><p>Öneri ve şikayetleriniz için e-posta yoluyla bize ulaşabilirsiniz. Her mesaja 48 saat içinde yanıt vermeye çalışıyoruz.</p>'
    },
]

async def fix():
    from app.core.database import AsyncSessionLocal
    from sqlalchemy import text
    async with AsyncSessionLocal() as db:
        for p in pages:
            r = await db.execute(text("SELECT id FROM static_pages WHERE slug=:s"), {'s': p['slug']})
            if not r.scalar():
                await db.execute(text("INSERT INTO static_pages (id, title, slug, content, is_active) VALUES (gen_random_uuid(), :title, :slug, :content, true)"), p)
                print(f"Eklendi: {p['title']}")
            else:
                print(f"Zaten var: {p['title']}")
        await db.commit()

asyncio.run(fix())
