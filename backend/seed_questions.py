import asyncio
import hashlib
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.models.question import Category, Question, DifficultyLevel, QuestionType

CATEGORY_META = {
    "tarih": "Tarih",
    "cografya": "Coğrafya",
    "genel-kultur": "Genel Kültür",
    "spor": "Spor",
    "sanat-edebiyat": "Sanat & Edebiyat",
    "yiyecek-icecek": "Yiyecek & İçecek",
    "yasam-saglik": "Yaşam & Sağlık",
}

BANK = {
    "tarih": {
        "easy": [
            ("Türkiye Cumhuriyeti hangi yıl ilan edilmiştir?", "1919", "1920", "1922", "1923", "D"),
            ("İstanbul'u fetheden Osmanlı padişahı kimdir?", "Yavuz Sultan Selim", "Fatih Sultan Mehmet", "Kanuni Sultan Süleyman", "Orhan Gazi", "B"),
            ("TBMM hangi tarihte açılmıştır?", "23 Nisan 1920", "19 Mayıs 1919", "29 Ekim 1923", "30 Ağustos 1922", "A"),
            ("Türkiye'nin ilk cumhurbaşkanı kimdir?", "İsmet İnönü", "Celal Bayar", "Mustafa Kemal Atatürk", "Fevzi Çakmak", "C"),
            ("Osmanlı Devleti'nin kurucusu kimdir?", "Orhan Bey", "Osman Bey", "Ertuğrul Gazi", "I. Murat", "B"),
            ("Çanakkale Savaşı hangi büyük savaş sırasında yaşanmıştır?", "Balkan Savaşları", "II. Dünya Savaşı", "I. Dünya Savaşı", "Kurtuluş Savaşı", "C"),
            ("Malazgirt Savaşı hangi yıl yapılmıştır?", "1071", "1176", "1204", "1453", "A"),
            ("İstiklal Marşı'nın şairi kimdir?", "Namık Kemal", "Yahya Kemal Beyatlı", "Ziya Gökalp", "Mehmet Akif Ersoy", "D"),
            ("Türkiye'nin başkenti hangi şehirdir ve hangi yıl başkent olmuştur?", "Ankara - 1923", "İstanbul - 1923", "Ankara - 1920", "İzmir - 1922", "A"),
            ("Piramitleriyle ünlü antik uygarlık hangisidir?", "Sümerler", "Hititler", "Mısırlılar", "Frigler", "C"),
        ],
        "medium": [
            ("Kanuni Sultan Süleyman kaç yıl tahtta kalmıştır?", "26 yıl", "31 yıl", "46 yıl", "52 yıl", "C"),
            ("Anadolu'da kurulan ilk Türk beyliklerinden Danişmentliler hangi bölgede hüküm sürmüştür?", "Ege", "Orta ve Kuzey Anadolu", "Trakya", "Güneydoğu", "B"),
            ("Osmanlı'da Lale Devri hangi padişah döneminde yaşanmıştır?", "III. Ahmet", "II. Mahmut", "I. Abdülhamit", "III. Selim", "A"),
            ("Fransız İhtilali hangi yıl başlamıştır?", "1776", "1789", "1804", "1848", "B"),
            ("Ankara Savaşı'nda Yıldırım Bayezid hangi hükümdara yenilmiştir?", "Cengiz Han", "Hülagü", "Timur", "Uzun Hasan", "C"),
            ("Tanzimat Fermanı hangi yıl ilan edilmiştir?", "1808", "1826", "1839", "1876", "C"),
            ("Kurtuluş Savaşı'nı sona erdiren ve Türkiye'yi uluslararası alanda tanıtan antlaşma hangisidir?", "Sevr Antlaşması", "Mudanya Ateşkesi", "Moskova Antlaşması", "Lozan Antlaşması", "D"),
            ("Türk tarihinde bilinen ilk yazılı belgeler olan Orhun Yazıtları hangi devlete aittir?", "Göktürkler", "Uygurlar", "Hunlar", "Karahanlılar", "A"),
            ("Amerika kıtasına ulaşan Kristof Kolomb hangi yıl bu yolculuğu yapmıştır?", "1453", "1492", "1519", "1588", "B"),
            ("Yavuz Sultan Selim'in Mısır Seferi sonucunda halifelik hangi devlete geçmiştir?", "Selçuklular", "Memlükler", "Osmanlılar", "Abbasiler", "C"),
        ],
        "hard": [
            ("Osmanlı Devleti'nde ilk anayasa olan Kanun-i Esasi hangi yıl yürürlüğe girmiştir?", "1839", "1856", "1876", "1908", "C"),
            ("Küçük Kaynarca Antlaşması hangi devletle imzalanmıştır?", "Avusturya", "Rusya", "Venedik", "İran", "B"),
            ("Hititlerin başkenti neresidir?", "Gordion", "Sardes", "Hattuşaş", "Kaneş", "C"),
            ("Türk tarihinde ilk kâğıt paranın (kaime) basıldığı dönem hangi padişaha aittir?", "II. Mahmut", "Abdülmecit", "Abdülaziz", "II. Abdülhamit", "B"),
            ("Otuz Yıl Savaşları'nı sona erdiren antlaşma hangisidir?", "Utrecht", "Vestfalya", "Viyana", "Paris", "B"),
            ("Karlofça Antlaşması hangi yıl imzalanmıştır?", "1683", "1699", "1718", "1739", "B"),
            ("İlk Türk denizci beyliklerinden Çaka Beyliği hangi şehirde kurulmuştur?", "İzmir", "Antalya", "Sinop", "Trabzon", "A"),
            ("Sanayi Devrimi ilk olarak hangi ülkede başlamıştır?", "Fransa", "Almanya", "İngiltere", "Hollanda", "C"),
            ("Osmanlı'da devşirme sistemiyle yetiştirilen askerî sınıf hangisidir?", "Sipahiler", "Akıncılar", "Yeniçeriler", "Azaplar", "C"),
            ("Selçuklu Devleti'nin kurucusu Tuğrul Bey hangi savaşla Anadolu'ya ilk büyük akınları başlatmıştır?", "Pasinler Savaşı", "Dandanakan Savaşı", "Katvan Savaşı", "Miryokefalon", "A"),
        ],
        "very_hard": [
            ("Dandanakan Savaşı hangi yıl yapılmıştır?", "1040", "1071", "1048", "1141", "A"),
            ("Osmanlı'da Nizam-ı Cedit ordusunu kuran padişah kimdir?", "I. Abdülhamit", "III. Selim", "II. Mahmut", "IV. Mustafa", "B"),
            ("Miryokefalon Savaşı hangi Selçuklu sultanı döneminde kazanılmıştır?", "Alparslan", "Melikşah", "II. Kılıçarslan", "I. Mesut", "C"),
            ("Sened-i İttifak hangi yıl imzalanmıştır?", "1808", "1826", "1839", "1789", "A"),
            ("Uygurların kullandığı ve Türk tarihinde önemli yer tutan yazı sistemi hangisidir?", "Göktürk alfabesi", "Uygur alfabesi", "Arap alfabesi", "Kiril alfabesi", "B"),
            ("Vasco da Gama hangi yıl Ümit Burnu'nu dolaşarak Hindistan'a ulaşmıştır?", "1487", "1492", "1498", "1519", "C"),
            ("Osmanlı'da tımar sisteminin bozulmasıyla ortaya çıkan büyük iç isyanlara ne ad verilir?", "Patrona Halil İsyanı", "Celali İsyanları", "Kabakçı Mustafa İsyanı", "Vaka-i Hayriye", "B"),
            ("Bizans İmparatorluğu'nun IV. Haçlı Seferi'nde İstanbul'un işgal edildiği yıl hangisidir?", "1096", "1204", "1261", "1453", "B"),
            ("Kavimler Göçü'nü başlatan Türk boyu hangisidir?", "Göktürkler", "Avarlar", "Hunlar", "Peçenekler", "C"),
            ("Osmanlı'da yeniçeri ocağının kaldırıldığı olaya verilen ad nedir?", "Vaka-i Hayriye", "Vaka-i Vakvakiye", "Edirne Vakası", "Patrona Halil", "A"),
        ],
    },
    "cografya": {
        "easy": [
            ("Türkiye'nin en yüksek dağı hangisidir?", "Erciyes", "Ağrı Dağı", "Uludağ", "Kaçkar", "B"),
            ("Türkiye'nin en uzun nehri hangisidir?", "Sakarya", "Fırat", "Kızılırmak", "Dicle", "C"),
            ("Türkiye'nin en büyük gölü hangisidir?", "Tuz Gölü", "Van Gölü", "Beyşehir Gölü", "Eğirdir Gölü", "B"),
            ("Dünyanın en büyük okyanusu hangisidir?", "Atlas Okyanusu", "Hint Okyanusu", "Büyük Okyanus", "Arktik Okyanusu", "C"),
            ("Türkiye kaç coğrafi bölgeye ayrılmıştır?", "5", "6", "7", "8", "C"),
            ("Kapadokya hangi ilimizin öne çıktığı turistik bölgedir?", "Nevşehir", "Konya", "Kayseri", "Niğde", "A"),
            ("İki kıtada toprağı bulunan Türkiye'nin Avrupa'daki bölümüne ne ad verilir?", "Anadolu", "Trakya", "Mezopotamya", "Kafkasya", "B"),
            ("Dünyanın en büyük çölü hangisidir?", "Gobi", "Kalahari", "Atacama", "Sahra", "D"),
            ("Türkiye'nin en kalabalık şehri hangisidir?", "Ankara", "İzmir", "İstanbul", "Bursa", "C"),
            ("Everest Dağı hangi sıradağlar üzerindedir?", "Alpler", "Himalayalar", "Andlar", "Kayalık Dağları", "B"),
        ],
        "medium": [
            ("Türkiye'nin yüz ölçümü bakımından en büyük ili hangisidir?", "Sivas", "Konya", "Erzurum", "Ankara", "B"),
            ("Ege kıyılarının girintili çıkıntılı olmasının temel nedeni nedir?", "Dağların kıyıya dik uzanması", "Dağların kıyıya paralel uzanması", "Volkanik faaliyetler", "Buzul aşındırması", "A"),
            ("Türkiye'de en fazla yağış alan bölge hangisidir?", "Akdeniz", "Marmara", "Doğu Karadeniz", "Ege", "C"),
            ("Amazon Nehri hangi kıtada bulunur?", "Afrika", "Asya", "Güney Amerika", "Avustralya", "C"),
            ("Türkiye'yi doğu-batı yönünde geçen ve deprem riski taşıyan büyük fay hattı hangisidir?", "Doğu Anadolu Fayı", "Kuzey Anadolu Fay Hattı", "Batı Anadolu Fayı", "Ege Fay Zonu", "B"),
            ("Pamukkale travertenleri hangi ilimizde bulunur?", "Muğla", "Aydın", "Denizli", "Afyonkarahisar", "C"),
            ("Dünyanın en derin gölü hangisidir?", "Van Gölü", "Baykal Gölü", "Victoria Gölü", "Titicaca", "B"),
            ("Türkiye'nin en büyük barajı olarak bilinen Atatürk Barajı hangi nehir üzerindedir?", "Dicle", "Fırat", "Kızılırmak", "Yeşilırmak", "B"),
            ("Karadeniz ile Marmara Denizi'ni birleştiren boğaz hangisidir?", "Çanakkale Boğazı", "İstanbul Boğazı", "Cebelitarık", "Süveyş", "B"),
            ("Türkiye'de karasal iklimin en belirgin görüldüğü bölge hangisidir?", "İç Anadolu", "Akdeniz", "Karadeniz", "Marmara", "A"),
        ],
        "hard": [
            ("Türkiye'nin en büyük adası hangisidir?", "Bozcaada", "Gökçeada", "Marmara Adası", "Büyükada", "B"),
            ("Tuz Gölü hangi bölge sınırları içindedir?", "Ege", "İç Anadolu", "Akdeniz", "Marmara", "B"),
            ("Türkiye'nin en düşük sıcaklık rekorlarının görüldüğü il hangisidir?", "Kars", "Erzurum", "Ardahan", "Ağrı", "C"),
            ("Nil Nehri hangi denize dökülür?", "Kızıldeniz", "Akdeniz", "Hint Okyanusu", "Atlas Okyanusu", "B"),
            ("Türkiye'de bor madeni rezervleri bakımından öne çıkan il hangisidir?", "Balıkesir", "Kütahya", "Eskişehir", "Zonguldak", "C"),
            ("Peribacalarının oluşumunda en etkili süreç hangisidir?", "Buzul aşındırması", "Rüzgâr ve akarsu aşındırması", "Deniz aşındırması", "Karstik erime", "B"),
            ("Türkiye'nin en uzun kıyı şeridine sahip denizi hangisidir?", "Karadeniz", "Ege", "Akdeniz", "Marmara", "B"),
            ("Dünyanın en uzun sıradağ sistemi hangisidir?", "Himalayalar", "Alpler", "Andlar", "Ural Dağları", "C"),
            ("Türkiye'de taş kömürü çıkarılan başlıca havza neresidir?", "Soma", "Zonguldak", "Elbistan", "Yatağan", "B"),
            ("Ekvator'un uzunluğu yaklaşık kaç kilometredir?", "20.000 km", "30.000 km", "40.000 km", "50.000 km", "C"),
        ],
        "very_hard": [
            ("Türkiye'nin en batı noktası hangisidir?", "Baba Burnu", "İnce Burun", "Dilek Yarımadası", "Gökçeada Avlaka Burnu", "D"),
            ("Türkiye'nin en kuzey noktası hangisidir?", "Sinop İnce Burun", "Samsun Bafra Burnu", "Zonguldak Baba Burnu", "Kırklareli Sarpdere", "A"),
            ("Volkanik kökenli olan Nemrut Krater Gölü hangi ilimizdedir?", "Van", "Bitlis", "Muş", "Adıyaman", "B"),
            ("Dünyanın en büyük yağmur ormanı hangi havzadadır?", "Kongo", "Amazon", "Borneo", "Yeni Gine", "B"),
            ("Türkiye'de dünya doğal mirası listesindeki Göreme Millî Parkı hangi jeolojik yapı üzerinde gelişmiştir?", "Kireçtaşı", "Volkanik tüf", "Granit", "Bazalt sütunları", "B"),
            ("Yeryüzünde deniz seviyesinden en alçak kara noktası neresidir?", "Ölü Deniz kıyısı", "Hazar kıyısı", "Death Valley", "Qattara Çukuru", "A"),
            ("Türkiye'de kişi başına düşen su miktarı açısından ülke hangi kategoride kabul edilir?", "Su zengini", "Su stresi yaşayan", "Su fakiri", "Su fazlası olan", "B"),
            ("Karstik arazilerde erime sonucu oluşan çukur şekle ne ad verilir?", "Dolin", "Menderes", "Moren", "Falez", "A"),
            ("Türkiye'nin en yüksek ikinci dağı hangisidir?", "Erciyes", "Süphan", "Cilo (Reşko)", "Kaçkar", "C"),
            ("Buzulların taşıyıp biriktirdiği malzemeye ne ad verilir?", "Moren", "Lös", "Delta", "Tombolo", "A"),
        ],
    },
    "genel-kultur": {
        "easy": [
            ("Türkiye'nin para birimi nedir?", "Lira", "Dinar", "Dirhem", "Riyal", "A"),
            ("Bir yılda kaç ay vardır?", "10", "11", "12", "13", "C"),
            ("Trafikte kırmızı ışık ne anlama gelir?", "Geç", "Dur", "Yavaşla", "Dikkat et", "B"),
            ("Türk bayrağında hangi iki sembol bulunur?", "Yıldız ve güneş", "Ay ve yıldız", "Kartal ve ay", "Hilal ve kılıç", "B"),
            ("İnsan vücudunda kaç adet kalp vardır?", "1", "2", "3", "4", "A"),
            ("Suyun kimyasal formülü nedir?", "CO2", "O2", "H2O", "NaCl", "C"),
            ("Bir haftada kaç gün vardır?", "5", "6", "7", "8", "C"),
            ("Türkiye'nin resmî dili nedir?", "Türkçe", "Arapça", "Farsça", "İngilizce", "A"),
            ("Güneş sistemindeki yaşadığımız gezegen hangisidir?", "Mars", "Venüs", "Dünya", "Jüpiter", "C"),
            ("Türkiye'nin telefon ülke kodu nedir?", "+90", "+30", "+7", "+49", "A"),
        ],
        "medium": [
            ("Birleşmiş Milletler hangi yıl kurulmuştur?", "1919", "1945", "1949", "1955", "B"),
            ("Dünyanın en kalabalık ülkelerinden biri olan Hindistan'ın başkenti neresidir?", "Mumbai", "Kalküta", "Yeni Delhi", "Chennai", "C"),
            ("Periyodik tabloda 'Fe' sembolü hangi elementi gösterir?", "Flor", "Demir", "Fosfor", "Fermiyum", "B"),
            ("Türkiye'nin ilk kadın başbakanı kimdir?", "Tansu Çiller", "Meral Akşener", "Güler Sabancı", "Nesrin Nas", "A"),
            ("Işığın bir yılda kat ettiği mesafeye ne ad verilir?", "Parsek", "Astronomik birim", "Işık yılı", "Kuazar", "C"),
            ("Nobel Ödülleri hangi ülkede verilir (barış ödülü hariç)?", "Norveç", "İsveç", "Danimarka", "Finlandiya", "B"),
            ("Türkiye'de zorunlu eğitim kaç yıldır?", "8", "10", "12", "14", "C"),
            ("Avrupa Birliği'nin ortak para birimi nedir?", "Frank", "Mark", "Euro", "Pound", "C"),
            ("Kanı vücuda pompalayan organ hangisidir?", "Akciğer", "Karaciğer", "Kalp", "Böbrek", "C"),
            ("Dünya çapında en çok konuşulan ana dil hangisidir?", "İngilizce", "İspanyolca", "Çince (Mandarin)", "Hintçe", "C"),
        ],
        "hard": [
            ("Türkiye'nin ilk üniversitesi olarak kabul edilen kurum hangisidir?", "İstanbul Üniversitesi", "Ankara Üniversitesi", "Ege Üniversitesi", "ODTÜ", "A"),
            ("İnternetin temelini oluşturan ARPANET hangi ülkede geliştirilmiştir?", "İngiltere", "ABD", "Almanya", "Japonya", "B"),
            ("Bir sayının kendisiyle çarpımına ne ad verilir?", "Küpü", "Karesi", "Kökü", "Faktöriyeli", "B"),
            ("Dünya Sağlık Örgütü'nün kısaltması nedir?", "UNICEF", "WHO", "UNESCO", "FAO", "B"),
            ("Türkiye'de Cumhuriyet döneminde harf devrimi hangi yıl yapılmıştır?", "1924", "1926", "1928", "1934", "C"),
            ("Atom numarası 1 olan element hangisidir?", "Helyum", "Hidrojen", "Lityum", "Oksijen", "B"),
            ("Türkiye'nin UNESCO Dünya Mirası listesindeki ilk yerlerinden biri olan Divriği Ulu Camii hangi ildedir?", "Sivas", "Erzurum", "Malatya", "Tokat", "A"),
            ("Bir dairenin çevresinin çapına oranı hangi sayıyla ifade edilir?", "e", "pi", "phi", "i", "B"),
            ("Türkiye'nin ilk yerli otomobil markası olarak bilinen ve 1961'de üretilen araç hangisidir?", "Anadol", "Devrim", "Şahin", "Murat 124", "B"),
            ("Dünyada en çok kullanılan işletim sistemi ailesi masaüstünde hangisidir?", "Linux", "macOS", "Windows", "Unix", "C"),
        ],
        "very_hard": [
            ("Türkiye'nin ilk Nobel ödüllü ismi kimdir?", "Aziz Sancar", "Orhan Pamuk", "Nazım Hikmet", "Yaşar Kemal", "B"),
            ("Kimya alanında Nobel Ödülü kazanan Türk bilim insanı kimdir?", "Oktay Sinanoğlu", "Aziz Sancar", "Feza Gürsey", "Cahit Arf", "B"),
            ("Cahit Arf'ın matematik literatürüne kazandırdığı kavram hangisidir?", "Arf değişmezi", "Arf sayısı", "Arf teoremi", "Arf dizisi", "A"),
            ("Türkiye'nin ilk uydusu hangisidir?", "Göktürk-1", "Türksat 1B", "Rasat", "Türksat 1A", "D"),
            ("Işık hızı yaklaşık olarak saniyede kaç kilometredir?", "150.000", "200.000", "300.000", "500.000", "C"),
            ("Bilgisayar biliminin kurucularından sayılan ve makine zekâsı testiyle bilinen isim kimdir?", "John von Neumann", "Alan Turing", "Claude Shannon", "Ada Lovelace", "B"),
            ("İlk modern Olimpiyat Oyunları hangi yıl düzenlenmiştir?", "1886", "1896", "1900", "1912", "B"),
            ("Türkiye'de Latin harfleriyle basılan ilk resmî sözlüklerden olan ve TDK tarafından hazırlanan sözlüğün adı nedir?", "Kamus-ı Türkî", "Türkçe Sözlük", "Lehçe-i Osmanî", "Divanü Lugati't-Türk", "B"),
            ("DNA'nın çift sarmal yapısını ortaya koyan bilim insanları kimlerdir?", "Watson ve Crick", "Mendel ve Darwin", "Pasteur ve Koch", "Fleming ve Florey", "A"),
            ("Türkiye'nin ilk anayasası kabul edilen Teşkilat-ı Esasiye hangi yıl yürürlüğe girmiştir?", "1920", "1921", "1924", "1876", "B"),
        ],
    },
    "spor": {
        "easy": [
            ("Bir futbol takımında sahada kaç oyuncu bulunur?", "9", "10", "11", "12", "C"),
            ("Basketbolda bir takım sahada kaç oyuncuyla oynar?", "5", "6", "7", "11", "A"),
            ("Türkiye'nin millî sporu olarak kabul edilen spor hangisidir?", "Futbol", "Güreş", "Basketbol", "Voleybol", "B"),
            ("Dünya Kupası hangi sporun en büyük turnuvasıdır?", "Basketbol", "Voleybol", "Futbol", "Hentbol", "C"),
            ("Olimpiyat Oyunları kaç yılda bir düzenlenir?", "2", "3", "4", "5", "C"),
            ("Futbolda hakemin oyuncuyu oyundan atmak için gösterdiği kart hangisidir?", "Sarı kart", "Kırmızı kart", "Mavi kart", "Yeşil kart", "B"),
            ("Voleybolda bir takım sahada kaç oyuncuyla oynar?", "5", "6", "7", "9", "B"),
            ("Tenis maçlarında oynanan bölümlere ne ad verilir?", "Devre", "Set", "Periyot", "Raunt", "B"),
            ("Yüzme hangi ortamda yapılan bir spordur?", "Kum", "Buz", "Su", "Çim", "C"),
            ("Kırkpınar Yağlı Güreşleri hangi ilimizde düzenlenir?", "Edirne", "Kırklareli", "Tekirdağ", "Bursa", "A"),
        ],
        "medium": [
            ("Bir basketbol maçı NBA'de kaç periyottan oluşur?", "2", "3", "4", "5", "C"),
            ("Formula 1'de bir yarışın kazananına verilen puan kaçtır?", "10", "15", "25", "30", "C"),
            ("Türkiye'nin olimpiyatlarda en çok madalya kazandığı branşlar arasında hangisi başta gelir?", "Atletizm", "Güreş", "Yüzme", "Jimnastik", "B"),
            ("Futbolda penaltı noktası kaleden kaç metre uzaklıktadır?", "9 metre", "10 metre", "11 metre", "12 metre", "C"),
            ("Maraton koşusunun mesafesi yaklaşık kaç kilometredir?", "21", "32", "42", "50", "C"),
            ("Basketbolda üç sayılık atış çizgisinin dışından atılan basket kaç sayıdır?", "1", "2", "3", "4", "C"),
            ("Kış Olimpiyatları'nda yer alan branşlardan biri hangisidir?", "Kürek", "Kayak", "Golf", "Okçuluk", "B"),
            ("Tenis Grand Slam turnuvalarından hangisi çim kortta oynanır?", "Fransa Açık", "Wimbledon", "ABD Açık", "Avustralya Açık", "B"),
            ("Türkiye'de futbolun en üst ligi hangi adla anılır?", "1. Lig", "Süper Lig", "Premier Lig", "Üst Lig", "B"),
            ("Bir voleybol setini kazanmak için normalde kaç sayıya ulaşmak gerekir?", "15", "21", "25", "30", "C"),
        ],
        "hard": [
            ("Türkiye'nin ilk Avrupa kupası kazanan futbol kulübü hangisidir?", "Fenerbahçe", "Galatasaray", "Beşiktaş", "Trabzonspor", "B"),
            ("Galatasaray'ın UEFA Kupası'nı kazandığı yıl hangisidir?", "1998", "1999", "2000", "2001", "C"),
            ("Naim Süleymanoğlu hangi branşta olimpiyat şampiyonluğu kazanmıştır?", "Güreş", "Halter", "Boks", "Atletizm", "B"),
            ("Türk milli takımının Dünya Kupası'nda üçüncü olduğu yıl hangisidir?", "1998", "2000", "2002", "2006", "C"),
            ("Basketbolda bir hücumun tamamlanması için verilen süre kaç saniyedir (FIBA)?", "20", "24", "30", "35", "B"),
            ("Modern olimpiyatları yeniden başlatan kişi kimdir?", "Pierre de Coubertin", "Juan Antonio Samaranch", "Avery Brundage", "Thomas Bach", "A"),
            ("Türkiye'nin olimpiyatlarda ilk altın madalyasını kazanan sporcu hangi branştandır?", "Güreş", "Halter", "Atletizm", "Boks", "A"),
            ("Futbolda ofsayt kuralı hangi durumda uygulanmaz?", "Taç atışında", "Korner atışında", "Kale vuruşunda", "Hepsinde uygulanmaz", "D"),
            ("Türkiye'de düzenlenen ve dünyanın en eski spor organizasyonlarından sayılan Kırkpınar kaç yılı aşkın süredir yapılmaktadır?", "300 yıl", "450 yıl", "550 yıl", "660 yıl", "D"),
            ("Bir buz hokeyi takımı sahada kaç oyuncuyla oynar?", "5", "6", "7", "11", "B"),
        ],
        "very_hard": [
            ("Türkiye'nin ilk olimpiyat altın madalyası hangi yılda kazanılmıştır?", "1936", "1948", "1952", "1960", "B"),
            ("Yaşar Doğu hangi branşta dünya çapında üne kavuşmuştur?", "Halter", "Güreş", "Atletizm", "Boks", "B"),
            ("Süleyman Atlı, Taha Akgül gibi isimlerin öne çıktığı branş hangisidir?", "Halter", "Güreş", "Judo", "Tekvando", "B"),
            ("Fenerbahçe'nin kuruluş yılı hangisidir?", "1903", "1905", "1907", "1911", "C"),
            ("Galatasaray Spor Kulübü hangi yıl kurulmuştur?", "1903", "1905", "1907", "1911", "B"),
            ("Beşiktaş Jimnastik Kulübü hangi yıl kurulmuştur?", "1899", "1903", "1907", "1911", "B"),
            ("Türk voleybolunda kadın milli takımının aldığı ilk Avrupa Şampiyonası madalyası hangi renkti (2003 öncesi dönem hariç ilk büyük madalya)?", "Altın", "Gümüş", "Bronz", "Madalya yok", "C"),
            ("Halterde Naim Süleymanoğlu kaç olimpiyat altın madalyası kazanmıştır?", "1", "2", "3", "4", "C"),
            ("Formula 1 tarihinde Türkiye Grand Prix'sinin düzenlendiği pist hangisidir?", "İstanbul Park", "İzmir Circuit", "Ankara Ring", "Bursa Park", "A"),
            ("Olimpiyat halkalarının sayısı ve temsil ettiği şey nedir?", "4 halka - mevsimler", "5 halka - kıtalar", "6 halka - okyanuslar", "7 halka - erdemler", "B"),
        ],
    },
    "sanat-edebiyat": {
        "easy": [
            ("Mona Lisa tablosunun ressamı kimdir?", "Michelangelo", "Leonardo da Vinci", "Rafael", "Van Gogh", "B"),
            ("'Çalıkuşu' romanının yazarı kimdir?", "Reşat Nuri Güntekin", "Halide Edip Adıvar", "Yakup Kadri", "Peyami Safa", "A"),
            ("Nasreddin Hoca hangi türde ünlüdür?", "Roman", "Fıkra", "Şiir", "Tiyatro", "B"),
            ("'İnce Memed' romanının yazarı kimdir?", "Orhan Kemal", "Yaşar Kemal", "Kemal Tahir", "Sabahattin Ali", "B"),
            ("Bir müzik eserinin yazıldığı işaret sistemine ne ad verilir?", "Nota", "Beste", "Ritim", "Melodi", "A"),
            ("Türk edebiyatında Nobel Edebiyat Ödülü alan yazar kimdir?", "Yaşar Kemal", "Orhan Pamuk", "Ahmet Hamdi Tanpınar", "Nazım Hikmet", "B"),
            ("'Kürk Mantolu Madonna' kimin eseridir?", "Sabahattin Ali", "Sait Faik", "Peyami Safa", "Refik Halid", "A"),
            ("Heykel sanatında kullanılan malzemelerden biri değildir?", "Mermer", "Bronz", "Kil", "Melodi", "D"),
            ("Karagöz ve Hacivat hangi geleneksel sanata aittir?", "Gölge oyunu", "Halk müziği", "Minyatür", "Ebru", "A"),
            ("Şiir yazan kişiye ne ad verilir?", "Ressam", "Şair", "Besteci", "Oyuncu", "B"),
        ],
        "medium": [
            ("'Yaban' romanının yazarı kimdir?", "Yakup Kadri Karaosmanoğlu", "Halide Edip", "Reşat Nuri", "Refik Halid Karay", "A"),
            ("Türk edebiyatında ilk roman kabul edilen eser hangisidir?", "Taaşşuk-ı Talat ve Fitnat", "İntibah", "Araba Sevdası", "Felatun Bey ile Rakım Efendi", "A"),
            ("'Safahat' adlı eserin şairi kimdir?", "Yahya Kemal", "Mehmet Akif Ersoy", "Tevfik Fikret", "Namık Kemal", "B"),
            ("Vincent van Gogh'un ünlü eseri hangisidir?", "Guernica", "Yıldızlı Gece", "Çığlık", "Su Zambakları", "B"),
            ("'Saatleri Ayarlama Enstitüsü' kimin romanıdır?", "Ahmet Hamdi Tanpınar", "Oğuz Atay", "Adalet Ağaoğlu", "Yusuf Atılgan", "A"),
            ("Türk minyatür sanatının ünlü ismi Nakkaş Osman hangi dönemde yaşamıştır?", "Selçuklu", "Osmanlı klasik dönem", "Cumhuriyet", "Beylikler", "B"),
            ("Dünya edebiyatının klasiklerinden 'Suç ve Ceza' kimin eseridir?", "Tolstoy", "Dostoyevski", "Çehov", "Gogol", "B"),
            ("Ebru sanatı hangi malzeme üzerine yapılır?", "Kumaş", "Ahşap", "Su üzerinden kâğıda", "Cam", "C"),
            ("'Tutunamayanlar' romanının yazarı kimdir?", "Oğuz Atay", "Bilge Karasu", "Vüs'at O. Bener", "Ferit Edgü", "A"),
            ("Beethoven hangi sanat dalının ünlü ismidir?", "Resim", "Müzik", "Heykel", "Edebiyat", "B"),
        ],
        "hard": [
            ("Divan edebiyatında gazel türünün en büyük ustalarından sayılan şair kimdir?", "Fuzuli", "Karacaoğlan", "Yunus Emre", "Pir Sultan Abdal", "A"),
            ("'Divanü Lugati't-Türk' adlı eserin yazarı kimdir?", "Yusuf Has Hacip", "Kaşgarlı Mahmut", "Ahmet Yesevi", "Edip Ahmet", "B"),
            ("Servet-i Fünun edebiyatının önde gelen romancısı kimdir?", "Halit Ziya Uşaklıgil", "Ahmet Mithat", "Namık Kemal", "Şinasi", "A"),
            ("Picasso'nun savaş karşıtı ünlü eseri hangisidir?", "Avignonlu Kızlar", "Guernica", "Üç Müzisyen", "Ağlayan Kadın", "B"),
            ("'Kutadgu Bilig' hangi türde yazılmış bir eserdir?", "Roman", "Siyasetname niteliğinde mesnevi", "Destan", "Tiyatro", "B"),
            ("Türk resminde 'Kaplumbağa Terbiyecisi' eserinin ressamı kimdir?", "Osman Hamdi Bey", "İbrahim Çallı", "Şeker Ahmet Paşa", "Fikret Mualla", "A"),
            ("Garip akımının kurucularından biri değildir?", "Orhan Veli", "Melih Cevdet", "Oktay Rifat", "Cemal Süreya", "D"),
            ("Rönesans döneminde Sistine Şapeli tavanını boyayan sanatçı kimdir?", "Michelangelo", "Donatello", "Botticelli", "Titian", "A"),
            ("'Mai ve Siyah' romanının yazarı kimdir?", "Halit Ziya Uşaklıgil", "Mehmet Rauf", "Hüseyin Rahmi", "Recaizade Mahmut Ekrem", "A"),
            ("İkinci Yeni şiir akımının önemli temsilcilerinden biri kimdir?", "Ziya Osman Saba", "Edip Cansever", "Faruk Nafiz", "Ahmet Haşim", "B"),
        ],
        "very_hard": [
            ("Türk edebiyatında ilk yerli tiyatro eseri kabul edilen yapıt hangisidir?", "Şair Evlenmesi", "Vatan yahut Silistre", "Zavallı Çocuk", "Akif Bey", "A"),
            ("Osmanlı hat sanatında 'Şeyh Hamdullah' hangi yazı türünün gelişiminde öncüdür?", "Sülüs-nesih", "Divani", "Kufi", "Talik", "A"),
            ("'Aşk-ı Memnu' romanı hangi edebî topluluğa aittir?", "Tanzimat", "Servet-i Fünun", "Millî Edebiyat", "Fecr-i Ati", "B"),
            ("Mimar Sinan'ın 'ustalık eserim' dediği yapı hangisidir?", "Şehzade Camii", "Süleymaniye Camii", "Selimiye Camii", "Mihrimah Sultan Camii", "C"),
            ("Nazım Hikmet'in ünlü uzun şiiri hangisidir?", "Memleketimden İnsan Manzaraları", "Otuz Beş Yaş", "Han Duvarları", "Sessiz Gemi", "A"),
            ("'Sessiz Gemi' şiirinin şairi kimdir?", "Yahya Kemal Beyatlı", "Ahmet Haşim", "Necip Fazıl", "Cahit Sıtkı", "A"),
            ("Dede Efendi hangi alanda ünlüdür?", "Hat", "Klasik Türk müziği bestekârlığı", "Minyatür", "Şiir", "B"),
            ("Empresyonizm akımının öncüsü sayılan ve 'İzlenim: Gündoğumu' eserini yapan ressam kimdir?", "Monet", "Manet", "Degas", "Renoir", "A"),
            ("Türk edebiyatında 'Fecr-i Ati' topluluğunun en tanınmış şairi kimdir?", "Ahmet Haşim", "Tevfik Fikret", "Cenap Şahabettin", "Rıza Tevfik", "A"),
            ("Osmanlı çini sanatının zirvesi kabul edilen üretim merkezi neresidir?", "Kütahya", "İznik", "Çanakkale", "Bursa", "B"),
        ],
    },
    "yiyecek-icecek": {
        "easy": [
            ("Türk kahvesi nasıl pişirilir?", "Cezvede", "Fırında", "Tavada", "Buharda", "A"),
            ("Baklavanın ana malzemesi hangisidir?", "Pirinç", "Yufka", "Bulgur", "Mısır", "B"),
            ("Ayran hangi üründen yapılır?", "Süt/yoğurt", "Meyve", "Tahıl", "Bal", "A"),
            ("Türk mutfağında çorba çeşidi olan 'mercimek' hangi baklagilden yapılır?", "Nohut", "Mercimek", "Fasulye", "Bakla", "B"),
            ("Pidenin en çok tüketildiği öğün hangisidir?", "Ana yemek/atıştırmalık", "Tatlı", "İçecek", "Salata", "A"),
            ("Zeytinyağı hangi meyveden elde edilir?", "Üzüm", "Zeytin", "Ceviz", "Ayçiçeği", "B"),
            ("Lahmacun genellikle neyle servis edilir?", "Limon ve maydanoz", "Şeker", "Bal", "Krema", "A"),
            ("Türkiye'de kahvaltıda yaygın olarak içilen sıcak içecek hangisidir?", "Çay", "Kola", "Şarap", "Ayran", "A"),
            ("Dondurmasıyla ünlü ilimiz hangisidir?", "Kahramanmaraş", "Rize", "Trabzon", "Sinop", "A"),
            ("Türk mutfağında 'dolma' nasıl hazırlanır?", "Sebzelerin içi doldurularak", "Kızartılarak", "Haşlanarak sadece", "Kurutularak", "A"),
        ],
        "medium": [
            ("Adana kebabı hangi etle yapılır?", "Tavuk", "Kıyma (kuzu)", "Balık", "Hindi", "B"),
            ("Hangi ilimiz 'künefe' ile özdeşleşmiştir?", "Antakya (Hatay)", "Konya", "Bolu", "Rize", "A"),
            ("Türk çayının en çok yetiştirildiği bölge hangisidir?", "Doğu Karadeniz", "Ege", "Akdeniz", "İç Anadolu", "A"),
            ("Mantı en çok hangi ilimizle özdeşleşir?", "Kayseri", "Adana", "İzmir", "Edirne", "A"),
            ("Fındık üretiminde Türkiye'de öne çıkan il hangisidir?", "Giresun", "Antalya", "Aydın", "Manisa", "A"),
            ("İskender kebabın çıkış yeri hangi ilimizdir?", "Bursa", "Konya", "Gaziantep", "Ankara", "A"),
            ("Boza hangi mevsimde geleneksel olarak tüketilir?", "Yaz", "Kış", "İlkbahar", "Sonbahar", "B"),
            ("Kuru incir üretimiyle ünlü ilimiz hangisidir?", "Aydın", "Rize", "Ordu", "Kars", "A"),
            ("Şalgam suyu hangi bölgenin geleneksel içeceğidir?", "Çukurova (Adana)", "Karadeniz", "Trakya", "Doğu Anadolu", "A"),
            ("Kars'ın coğrafi işaretli ünlü peyniri hangisidir?", "Kaşar", "Gravyer", "Tulum", "Lor", "B"),
        ],
        "hard": [
            ("Gaziantep'in coğrafi işaretli ünlü tatlısı hangisidir?", "Baklava", "Kadayıf", "Sütlaç", "Revani", "A"),
            ("Türk mutfağında 'perde pilav' hangi ilimizle özdeşleşmiştir?", "Siirt", "Şanlıurfa", "Erzincan", "Malatya", "A"),
            ("Kayısı üretiminde dünyaca ünlü ilimiz hangisidir?", "Malatya", "Isparta", "Amasya", "Niğde", "A"),
            ("'Testi kebabı' hangi bölgemizin geleneksel yemeğidir?", "Kapadokya (Nevşehir çevresi)", "Trakya", "Ege", "Karadeniz", "A"),
            ("Türk mutfağında 'çiğ köfte' geleneksel olarak hangi tahılla yapılır?", "Pirinç", "Bulgur", "Mısır", "Arpa", "B"),
            ("Afyonkarahisar'ın coğrafi işaretli ünlü ürünü hangisidir?", "Sucuk ve kaymak", "Peynir helvası", "Zeytin", "Fındık", "A"),
            ("Zeytinyağının kalitesini belirleyen temel ölçütlerden biri nedir?", "Asit oranı", "Renk yoğunluğu", "Şişe boyutu", "Depolama süresi", "A"),
            ("Türkiye'de coğrafi işaret tescili olan 'Ezine peyniri' hangi ilimizdendir?", "Çanakkale", "Balıkesir", "Edirne", "Tekirdağ", "A"),
            ("'Su böreği' hazırlanırken yufkalar hangi işlemden geçirilir?", "Haşlanır", "Kızartılır", "Kurutulur", "Buğulanır", "A"),
            ("Rize'nin en bilinen tarımsal ürünü hangisidir?", "Çay", "Fındık", "Zeytin", "Pamuk", "A"),
        ],
        "very_hard": [
            ("Hünkâr beğendi yemeğinde püre hangi sebzeden yapılır?", "Kabak", "Patlıcan", "Patates", "Havuç", "B"),
            ("Osmanlı saray mutfağında yemeklerin hazırlandığı bölüme ne ad verilirdi?", "Matbah-ı Amire", "Harem", "Enderun", "Divanhane", "A"),
            ("'Kesme dondurma' olarak da bilinen Maraş dondurmasına kıvamını veren bitkisel madde nedir?", "Salep (orkide kökü)", "Nişasta", "Jelatin", "Pektin", "A"),
            ("Türk mutfağında 'keşkek' hangi tahıl ve etin birlikte dövülmesiyle yapılır?", "Buğday ve et", "Pirinç ve tavuk", "Mısır ve balık", "Arpa ve kuzu", "A"),
            ("UNESCO Somut Olmayan Kültürel Miras listesinde yer alan Türk yemek geleneklerinden biri hangisidir?", "Keşkek geleneği", "Lahmacun yapımı", "Kokoreç", "Menemen", "A"),
            ("Türk kahvesinin UNESCO listesine girmesindeki tescil adı neyi kapsar?", "Kahve kültürü ve geleneği", "Kahve ticareti", "Kahve tarımı", "Kahve makineleri", "A"),
            ("Antakya mutfağında yaygın olan ve nar ekşisiyle bilinen mezelerden biri hangisidir?", "Muhammara", "Cacık", "Haydari", "Piyaz", "A"),
            ("'Tarhana' geleneksel olarak nasıl saklanır?", "Kurutularak", "Dondurularak", "Salamurada", "Tütsülenerek", "A"),
            ("Türkiye'de üzümün kaynatılıp yoğunlaştırılmasıyla elde edilen geleneksel ürün hangisidir?", "Pekmez", "Reçel", "Marmelat", "Şerbet", "A"),
            ("Osmanlı'da şerbet yapımında yaygın kullanılan ve hoş koku veren bitki hangisidir?", "Gül", "Defne", "Kekik", "Adaçayı", "A"),
        ],
    },
    "yasam-saglik": {
        "easy": [
            ("Günde ortalama kaç litre su içilmesi önerilir?", "0,5 litre", "1 litre", "2-2,5 litre", "5 litre", "C"),
            ("Diş sağlığı için günde kaç kez diş fırçalanması önerilir?", "1", "2", "4", "6", "B"),
            ("Vücudumuzun oksijen aldığı organ hangisidir?", "Kalp", "Akciğer", "Mide", "Karaciğer", "B"),
            ("El yıkamak hangi amaca hizmet eder?", "Enfeksiyonlardan korunma", "Kilo verme", "Kas geliştirme", "Uyku düzeni", "A"),
            ("C vitamini en çok hangi besinlerde bulunur?", "Kırmızı et", "Turunçgiller", "Ekmek", "Pirinç", "B"),
            ("Yetişkin bir insanın normal vücut sıcaklığı yaklaşık kaç derecedir?", "34", "36,5", "39", "41", "B"),
            ("Sigara kullanımı en çok hangi organı olumsuz etkiler?", "Akciğer", "Böbrek", "Pankreas", "Dalak", "A"),
            ("Kemik sağlığı için önemli olan mineral hangisidir?", "Kalsiyum", "Sodyum", "Klor", "Kükürt", "A"),
            ("Yetişkin bir kişi için önerilen günlük uyku süresi yaklaşık kaç saattir?", "3-4", "5-6", "7-9", "11-12", "C"),
            ("Acil sağlık hizmetleri için Türkiye'de aranan numara nedir?", "112", "155", "110", "156", "A"),
        ],
        "medium": [
            ("Vücutta kan şekerini düzenleyen hormon hangisidir?", "İnsülin", "Adrenalin", "Tiroksin", "Kortizol", "A"),
            ("Kansızlık (anemi) en çok hangi mineralin eksikliğiyle ilişkilidir?", "Demir", "Çinko", "Magnezyum", "Potasyum", "A"),
            ("D vitamininin vücutta üretilmesinde en önemli etken nedir?", "Güneş ışığı", "Egzersiz", "Su tüketimi", "Uyku", "A"),
            ("Tansiyon ölçümünde 'büyük tansiyon' hangi değeri ifade eder?", "Sistolik", "Diyastolik", "Nabız", "Kan şekeri", "A"),
            ("İnsan vücudunda en büyük organ hangisidir?", "Karaciğer", "Deri", "Akciğer", "Bağırsak", "B"),
            ("Kalp krizi belirtilerinden biri değildir?", "Göğüs ağrısı", "Kola yayılan ağrı", "Soğuk terleme", "Tırnak uzaması", "D"),
            ("Bağışıklık sistemi için önemli olan ve kanda savunmadan sorumlu hücreler hangileridir?", "Alyuvarlar", "Akyuvarlar", "Trombositler", "Plazma", "B"),
            ("Düzenli egzersizin en bilinen faydalarından biri nedir?", "Kalp-damar sağlığını iyileştirmesi", "Boy uzatması", "Göz rengini değiştirmesi", "Kan grubunu değiştirmesi", "A"),
            ("Aşıların temel işlevi nedir?", "Bağışıklık kazandırmak", "Ağrı kesmek", "Ateş düşürmek", "Kan basıncını artırmak", "A"),
            ("İnsanda normal dinlenme nabzı yaklaşık kaç atım/dakikadır?", "20-40", "60-100", "120-140", "150-180", "B"),
        ],
        "hard": [
            ("Tiroid bezi vücutta hangi işlevi düzenler?", "Metabolizma", "Kan pıhtılaşması", "Görme", "İşitme", "A"),
            ("Kolesterolde 'iyi kolesterol' olarak bilinen tür hangisidir?", "LDL", "HDL", "VLDL", "Trigliserit", "B"),
            ("Tip 1 diyabetin temel nedeni nedir?", "İnsülin üretiminin yetersizliği/yokluğu", "Aşırı egzersiz", "Yüksek tansiyon", "Demir eksikliği", "A"),
            ("Vücutta kırmızı kan hücrelerinin üretildiği yer neresidir?", "Kemik iliği", "Karaciğer", "Dalak", "Böbrek", "A"),
            ("Antibiyotikler hangi tür enfeksiyonlarda etkilidir?", "Bakteriyel", "Viral", "Mantar", "Alerjik", "A"),
            ("Yüksek tansiyonun uzun vadede en çok risk oluşturduğu organlardan biri hangisidir?", "Böbrek", "Pankreas", "Dalak", "Tiroid", "A"),
            ("Vücudun sıvı-elektrolit dengesinde önemli rol oynayan organ hangisidir?", "Böbrek", "Mide", "Akciğer", "Dalak", "A"),
            ("Beslenmede 'glisemik indeks' neyi ifade eder?", "Besinin kan şekerini yükseltme hızı", "Yağ oranı", "Protein oranı", "Kalori miktarı", "A"),
            ("Osteoporoz hangi durumla ilgilidir?", "Kemik yoğunluğunun azalması", "Kas kaybı", "Göz tansiyonu", "Karaciğer yağlanması", "A"),
            ("İlk yardımda kalp masajı ve suni solunum uygulamasına ne ad verilir?", "CPR (Temel Yaşam Desteği)", "Heimlich", "Triaj", "Anamnez", "A"),
        ],
        "very_hard": [
            ("Vücutta bağışıklık hafızasını sağlayan hücre tipi hangisidir?", "Bellek (memory) lenfositler", "Eritrositler", "Trombositler", "Nöronlar", "A"),
            ("Karaciğerin ürettiği ve yağların sindirimine yardımcı olan salgı hangisidir?", "Safra", "İnsülin", "Pepsin", "Amilaz", "A"),
            ("Hemoglobin molekülünün yapısında hangi element bulunur?", "Demir", "Magnezyum", "Çinko", "Bakır", "A"),
            ("Böbreklerde kanın süzüldüğü temel yapısal birim hangisidir?", "Nefron", "Alveol", "Villus", "Nöron", "A"),
            ("Akciğerlerde gaz alışverişinin gerçekleştiği yapılar hangileridir?", "Alveoller", "Bronşlar", "Trakea", "Plevra", "A"),
            ("B12 vitamini eksikliğinde en çok görülen tabloya ne ad verilir?", "Megaloblastik anemi", "Demir eksikliği anemisi", "Talasemi", "Hemofili", "A"),
            ("Vücutta pıhtılaşmada rol oynayan kan hücreleri hangileridir?", "Trombositler", "Akyuvarlar", "Alyuvarlar", "Plazma hücreleri", "A"),
            ("İnsan vücudunda pankreasın hem sindirim hem hormon salgılaması ona hangi özelliği kazandırır?", "Karma bez olması", "Endokrin bez olması", "Ekzokrin bez olması", "Lenf bezi olması", "A"),
            ("Beyinde denge ve koordinasyondan sorumlu bölüm hangisidir?", "Beyincik", "Omurilik soğanı", "Hipofiz", "Talamus", "A"),
            ("İnsan vücudunda toplam kaç çift kromozom bulunur?", "23", "24", "46", "22", "A"),
        ],
    },
}

DIFF_MAP = {
    "easy": DifficultyLevel.easy,
    "medium": DifficultyLevel.medium,
    "hard": DifficultyLevel.hard,
    "very_hard": DifficultyLevel.very_hard,
}


def make_hash(text, a, b, c, d):
    raw = "|".join([text.strip(), a.strip(), b.strip(), c.strip(), d.strip()])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


async def get_or_create_category(session, slug, name):
    res = await session.execute(select(Category).where(Category.slug == slug))
    cat = res.scalar_one_or_none()
    if cat:
        return cat
    cat = Category(name=name, slug=slug)
    session.add(cat)
    await session.flush()
    print(f"[+] Kategori olusturuldu: {name} ({slug})")
    return cat


async def main():
    added = 0
    skipped = 0
    async with AsyncSessionLocal() as session:
        for slug, diffs in BANK.items():
            cat = await get_or_create_category(session, slug, CATEGORY_META[slug])
            for diff_key, rows in diffs.items():
                for text, a, b, c, d, correct in rows:
                    h = make_hash(text, a, b, c, d)
                    res = await session.execute(
                        select(Question).where(Question.content_hash == h)
                    )
                    if res.scalar_one_or_none():
                        skipped += 1
                        continue
                    q = Question(
                        text=text,
                        option_a=a,
                        option_b=b,
                        option_c=c,
                        option_d=d,
                        correct_answer=correct.upper(),
                        category_id=cat.id,
                        difficulty=DIFF_MAP[diff_key],
                        question_type=QuestionType.multiple_choice,
                        is_active=True,
                        is_approved=True,
                        content_hash=h,
                    )
                    session.add(q)
                    added += 1
        await session.commit()
    total = sum(len(r) for d in BANK.values() for r in d.values())
    print(f"\n[OK] Toplam bank: {total} | Eklenen: {added} | Atlanan (mevcut): {skipped}")


if __name__ == "__main__":
    asyncio.run(main())
