# Handoff: UDF Çevirici — resmî portal tarzı yeniden tasarım

## Overview
`udf-kit` (PDF → UYAP UDF dönüştürücü) sitesinin ana sayfasının yeniden tasarımı. Amaç: Türk kamu portallarının resmî, form ağırlıklı görsel diline yakın, tek sayfalık bir dönüştürme arayüzü. Tüm dönüşüm tarayıcıda çalışır; tasarım bu mevcut davranışı değiştirmez, yalnızca arayüzü sarar.

**Önemli:** Bu tasarım e-Devlet veya UYAP'ın markasını, logosunu ya da kendine özgü arayüz bileşenlerini kopyalamaz. Resmî portal görsel dili özgün bileşenlerle kurulmuştur. Üst şeritte ve altbilgide "resmî bir kurum sitesi değildir" ibaresi bilinçli olarak yer alır; kaldırmayın.

## About the Design Files
Bu pakettteki `udf-cevirici.dc.html`, HTML ile üretilmiş bir **tasarım referansıdır** — hedeflenen görünüm ve davranışı gösteren bir prototip, doğrudan kopyalanacak üretim kodu değil. Görev, bu tasarımı hedef kod tabanının kendi ortamında (mevcut `udf-kit` statik HTML/CSS/JS yapısında) yeniden kurmaktır. Dosyadaki stiller inline yazılmıştır; hedef projede bunları normal CSS sınıflarına taşıyın.

Dosya bir bileşen çalışma zamanı kullanır (`<sc-if>`, `{{ ... }}` alanları, alttaki `class Component` mantığı). Bunlar **prototip aracına aittir**, taşınmayacaktır. Karşılıkları:
- `<sc-if value="{{ isIdle }}">` → koşullu görünen/gizlenen blok
- `{{ fileName }}`, `{{ fileMeta }}`, `{{ outName }}`, `{{ stepLabel }}`, `{{ statusText }}` → JS ile doldurulan metin düğümleri
- `onClick`, `onDrop`, `ref` öznitelikleri → normal `addEventListener`
- `style-hover="..."` → CSS `:hover` kuralı

## Fidelity
**Hi-fi.** Renkler, tipografi, boşluklar ve durumlar nihaidir; piksel düzeyinde birebir uygulanmalıdır.

## Screens / Views

Tek ekran (ana sayfa), üç durumlu bir işlem paneli içerir.

### Sayfa iskeleti
Yukarıdan aşağıya:
1. Üst şerit (koyu lacivert bilgi çubuğu)
2. Başlık (logo + site adı + rozet), altında 3px kırmızı çizgi
3. Breadcrumb şeridi
4. İçerik alanı: `max-width: 1180px`, `padding: 22px 24px 48px`, `display: grid`, `grid-template-columns: 268px 1fr`, `gap: 22px`, `align-items: start`
5. Altbilgi

Tüm tam genişlik şeritlerinin iç sarmalayıcısı: `max-width: 1180px; margin: 0 auto`.

### 1. Üst şerit
- Arka plan `#0b2c47`, metin `#a9c3d6`, `font-size: 13px`, `padding: 7px 24px`
- Sol: "Bağımsız açık kaynak araç. Resmî bir kurum sitesi değildir."
- Sağ: flex, `gap: 18px` — GitHub, English (`#d7e6f1`)

### 2. Başlık
- Arka plan `#fff`, `border-bottom: 3px solid #b41028`, `padding: 16px 24px`, flex space-between, `flex-wrap: wrap`
- **Logo (belge ikonu, saf CSS):** dış kutu `38×46px`, `border: 2px solid #0d4c7a`, `border-radius: 2px`, beyaz zemin, `position: relative`
  - Kıvrık köşe: sağ üstte `13×13px`, `top:-2px; right:-2px`, beyaz zemin, `border-left`/`border-bottom: 2px solid #0d4c7a`
  - Satırlar (`height: 2px`, `left: 7px`): `top:18px right:16px #0d4c7a` (başlık satırı), `top:25px right:8px #a9bccb`, `top:32px right:8px #a9bccb`, `top:39px right:18px #a9bccb`
  - Rozet: `bottom:-7px; right:-11px`, `#b41028` zemin, beyaz `9px/700` "UDF", `padding: 2px 5px`, `letter-spacing: .04em`
- Yazı bloğu: **UDF Çevirici** (19px/700, `letter-spacing: -.01em`), altında "PDF → UYAP Doküman Formatı" (13px, `#5b6b7b`)
- Sağdaki rozet: "Sunucusuz, tarayıcıda çalışır" — `border: 1px solid #d3dbe3`, zemin `#f6f8fa`, `padding: 6px 12px`, 14px, `#5b6b7b`

### 3. Breadcrumb
`#f4f6f8` zemin, `border-bottom: 1px solid #dbe2e8`, `padding: 9px 24px`, 13px `#5b6b7b`. Metin: `Ana sayfa › Belge işlemleri › PDF'ten UDF'ye çevirme` (son öğe `#1b2733`, 600).

### 4. Sol menü (268px)
- Kart: `#fff`, `border: 1px solid #d3dbe3`, `border-radius: 2px`
- Başlık: `#0d4c7a` zemin, beyaz, 14px/700, `letter-spacing: .02em`, `padding: 11px 16px`, metin "İŞLEM MENÜSÜ"
- Öğeler: flex space-between, `padding: 12px 16px`, `border-bottom: 1px solid #eaeef2` (sonuncuda yok), `border-left: 3px solid transparent`, metin `#33475b` 15px, sağda `›` `#9fb0bf`
- Aktif öğe: `border-left-color: #b41028`, zemin `#f3f7fa`, metin `#0b2c47` 700, ok `#b41028`
- Öğeler: PDF'i UDF'ye çevir (`#panel`), İşlem adımları (`#adimlar`), UDF dosyası nedir? (`#udf`), Gizlilik ve güvenlik (`#gizlilik`), Sık sorulan sorular (`#sss`)

### 5. İçerik panelleri (sağ kolon)
Ortak panel deseni — tüm bölümler bunu kullanır:
- Kart: `#fff`, `border: 1px solid #d3dbe3`, `border-radius: 2px`
- Panel başlığı: `#f4f6f8` zemin, `border-bottom: 1px solid #d3dbe3`, `padding: 12px 18px`, `<strong>` 16px
- Gövde: `padding: 20px 18px`
- Paneller arası `gap: 22px` (dikey flex)

#### 5a. Evrak Dönüştürme İşlemi (`#panel`)
Başlık satırında sağda adım sayacı: `{{ stepLabel }}` = `Adım 1 / 3` (boşta), `Adım 2 / 3` (dosya seçili/işleniyor), `Adım 3 / 3` (bitti). 13px `#5b6b7b` 600.

**Bilgi şeridi (her durumda görünür):** `border: 1px solid #cfe0ee`, zemin `#f2f8fc`, `padding: 12px 16px`, `margin-bottom: 18px`, 14px `#2b4d66`, flex `gap: 10px`. Solda `20×20px` daire `#0d4c7a`, beyaz `12px/700` "i". Metin: "Dönüşüm cihazınızda yapılır. Seçtiğiniz PDF sunucuya gönderilmez."

**Durum A — boşta (`isIdle`):**
- Form satırı 1: grid `190px 1fr`, `gap: 14px`, `padding-bottom: 16px`, `border-bottom: 1px solid #eaeef2`
  - Etiket "Belge türü" 15px/700 `#33475b`, yanında `*` `#b41028`
  - Değer kutusu: `border: 1px solid #d3dbe3`, `#f6f8fa`, `padding: 9px 12px`, metin "PDF (.pdf), tek dosya"
- Form satırı 2: grid `190px 1fr`, `padding-top: 16px`, etiket "Evrak dosyası *" (`padding-top: 8px`)
  - **Drop zone** (`<label>`, gizli `<input type="file" accept="application/pdf">` içerir): dikey flex, ortalı, `gap: 10px`, `border: 2px dashed #a8bccd`, zemin `#f4f8fb`, `padding: 34px 20px`, `cursor: pointer`, `border-radius: 2px`
    - `:hover` → `border-color: #0d4c7a`, zemin `#edf4f9`
    - `dragover` → `border-color: #0d4c7a`, zemin `#e6f0f8` (JS ile; `dragleave`/`drop` sonrası `#a8bccd` / `#f4f8fb`'e döner)
    - İçindeki PDF ikonu: `46×58px` kutu, `border: 2px solid #0d4c7a`, beyaz zemin; üç gri satır (`height: 2px`, `#cbd8e2`, `left: 9px`; `top:12 right:9`, `top:21 right:9`, `top:30 right:18`); rozet `bottom:-8px right:-11px`, `#b41028`, beyaz `10px/700` "PDF", `padding: 2px 6px`
    - Başlık "PDF dosyanızı buraya bırakın" 16px/700; alt satır "veya tıklayıp bilgisayarınızdan seçin" 14px `#5b6b7b`

**Durum B — dosya seçili (`hasFile`):**
- Etiket/değer tablosu: `width: 100%`, `border-collapse: collapse`, `border: 1px solid #d3dbe3`, 15px
  - Etiket hücresi: `width: 190px`, `#f6f8fa`, `padding: 11px 14px`, 700, `#33475b`; satır ayırıcı `border-bottom: 1px solid #e6ecf1`
  - Satırlar: "Dosya adı" → `{{ fileName }}`; "Boyut ve tür" → `{{ fileMeta }}` (ör. `293 KB, PDF`); "Çözünürlük" → "200 DPI, sayfa görüntüsü olarak gömülür"
- Buton satırı (`margin-top: 16px`, flex `gap: 12px`, `flex-wrap: wrap`):
  - Birincil: "UDF'ye çevir" — `#b41028`, beyaz, `padding: 11px 24px`, 16px/700, `border-radius: 2px`; `:hover` `#96091f`
  - İkincil: "Vazgeç" — beyaz zemin, `border: 1px solid #c3ced8`, `#33475b`, `padding: 11px 20px`, 16px/600; `:hover` `border-color: #0d4c7a`, metin `#0b2c47`
  - Yanında `{{ statusText }}` 14px `#5b6b7b`

**Durum C — tamamlandı (`isDone`):**
- Başarı şeridi: `border: 1px solid #b7dcc6`, zemin `#f1faf4`, `padding: 16px 18px`, `margin-bottom: 16px`, flex `gap: 14px`. `24×24px` daire `#1a7a45`, beyaz `✓`. Başlık "İşlem tamamlandı" 700; alt metin `#40624f`: "Belgeniz UYAP Doküman Editörü ile uyumlu UDF formatında oluşturuldu."
- Aynı tablo deseni: "Oluşan belge" → `{{ outName }}`, "Kaynak dosya" → `{{ fileName }}`
- Butonlar: "UDF dosyasını indir" — `#1a7a45`, beyaz, `:hover` `#146137`; "Yeni dönüşüm" — ikincil buton (sıfırlar)

#### 5b. İşlem adımları (`#adimlar`)
Gövde: `grid-template-columns: repeat(3, 1fr)`, `gap: 18px`. Her öğe flex `gap: 12px`:
- `30×30px` daire `#0d4c7a`, beyaz 15px/700 numara
- Başlık `<strong>` (`margin-bottom: 4px`), açıklama 15px `#4d5f70`, `text-wrap: pretty`

Metinler:
1. **PDF dosyanızı seçin** — "Dilekçe, tutanak, rapor. Dosyayı evrak alanına sürükleyin veya tıklayıp seçin."
2. **Dönüşümü bekleyin** — "Her sayfa tarayıcınızda 200 DPI çözünürlükte işlenir ve UDF belgesine gömülür."
3. **UDF dosyasını indirin** — "İnen .udf dosyasını UYAP Doküman Editörü'nde açın veya doğrudan UYAP'a yükleyin."

#### 5c. UDF dosyası nedir? (`#udf`)
İki paragraf, `#3c4c5c`, `text-wrap: pretty`, ilkinde `margin-bottom: 12px`. Metinler prototip dosyasında birebir mevcuttur.

#### 5d. Gizlilik ve güvenlik (`#gizlilik`)
Koyu panel: zemin `#0b2c47`, metin `#dbe8f1`, `border-radius: 2px`. Başlık satırı `padding: 12px 18px`, `border-bottom: 1px solid rgba(255,255,255,.14)`, `<strong>` beyaz 16px.
Gövde: grid `1.1fr .9fr`, `gap: 28px`.
- Sol: iki paragraf `#b9d0e0`; içerideki bağlantı `#8fc7ee`
- Sağ: 2×2 grid, `gap: 10px`. Her kutu `border: 1px solid rgba(255,255,255,.16)`, `padding: 14px`. Üst satır Source Serif 4, 20px, beyaz; alt satır 13px `#a9c3d6`
  - `0` / "sunucuya giden dosya" · `200 DPI` / "sayfa çözünürlüğü" · `MIT` / "açık kaynak lisansı" · `Çevrimdışı` / "bağlantısız çalışır"

#### 5e. Sık sorulan sorular (`#sss`)
`<details>`/`<summary>` akordeon, 6 soru. İlki açık.
- `summary`: flex space-between, `padding: 15px 18px`, 16px/700, `cursor: pointer`; native ok gizli (`list-style: none`, `::-webkit-details-marker { display: none }`)
- Sağdaki `+` işareti `#b41028`, 19px, `transition: transform .18s`; `details[open]` iken `transform: rotate(45deg)` (× olur)
- Cevap: `padding: 0 18px 15px`, `#4d5f70`, `text-wrap: pretty`
- Öğeler arasında `border-bottom: 1px solid #e6ecf1` (sonuncuda yok)

Sorular: UYAP'ta açılır mı / metin düzenlenebilir mi / boyut sınırı / parola korumalı PDF / ücret ve üyelik / telefonda çalışır mı. Cevaplar prototipte birebir.

### 6. Altbilgi
Zemin `#071f33`, metin `#93b0c6`, `padding: 26px 24px`, `border-top: 3px solid #b41028`, 14px. Sol: "UDF Çevirici, açık kaynak, MIT lisansı. UYAP ve e-Devlet ile bağlantısı yoktur." Sağ: GitHub, English (`#cfe0ec`), flex `gap: 20px`.

## Interactions & Behavior
- **Dosya seçimi:** drop zone tıklaması gizli file input'u açar; `dragover` (varsayılanı iptal et) zemin/kenarlığı koyulaştırır, `dragleave` ve `drop` geri alır; `drop` ilk dosyayı alır (`dataTransfer.files[0]`).
- **Dosya kabulü:** boyut biçimlendirme — 1 MB altı `Math.max(1, Math.round(bytes/1024)) + " KB"`, üstü `(bytes/1048576).toFixed(1) + " MB"`; sonuna `", PDF"` eklenir. Durum `ready` olur, `statusText` = "Dönüşüm cihazınızda yapılır."
- **Çevirme:** "UDF'ye çevir" durumu `working` yapar, `statusText` = "Sayfalar işleniyor." Prototipte 1200 ms sonra `done` olur — **gerçek uygulamada burası mevcut PDF→UDF dönüştürme kodudur.** Uzun süren işlemler için bu satıra bir ilerleme göstergesi (işlenen sayfa / toplam sayfa) eklemeniz önerilir; prototipte yok.
- **İndirme:** `done` durumunda birincil buton üretilen UDF blob'unu indirir. Çıktı adı: kaynak ad, `.pdf` uzantısı büyük/küçük harf duyarsız kaldırılıp `.udf` eklenerek üretilir.
- **Sıfırlama:** "Vazgeç" ve "Yeni dönüşüm" durumu `idle`'a döndürür ve dosya alanlarını temizler.
- **Akordeon:** native `<details>`, JS gerekmez.
- **Menü bağlantıları:** aynı sayfa içi `#` çıpaları.
- **Hata durumu:** prototipte tanımlı değil. Uygulamada bozuk/parola korumalı PDF için bilgi şeridiyle aynı desende bir kırmızı uyarı şeridi ekleyin (`border: 1px solid #e6b7bf`, zemin `#fdf3f4`, ikon dairesi `#b41028`).

## State Management
Tek bileşen, dört alanlı yerel durum:
- `stage`: `"idle" | "ready" | "working" | "done"`
- `fileName`: string
- `fileMeta`: string (biçimlenmiş boyut + tür)
- `status`: string (buton yanındaki satır)

Türetilenler: `stepLabel` (idle→1, done→3, diğer→2), `outName`. Veri çekme yok; ağ isteği yok.

## Design Tokens

**Renkler**
| Rol | Değer |
|---|---|
| Kurumsal lacivert | `#0d4c7a` |
| Koyu lacivert (şerit/panel) | `#0b2c47` |
| En koyu (altbilgi) | `#071f33` |
| Kırmızı vurgu | `#b41028` (hover `#96091f`) |
| Yeşil (başarı) | `#1a7a45` (hover `#146137`) |
| Sayfa zemini | `#e7ebef` |
| Panel başlığı / dolgu | `#f4f6f8`, `#f6f8fa`, `#fbfcfd` |
| Kart zemini | `#ffffff` |
| Kenarlık | `#d3dbe3` (kart), `#e6ecf1` / `#eaeef2` (iç ayırıcı), `#dbe2e8` |
| Ana metin | `#1b2733` |
| İkincil metin | `#33475b`, `#4d5f70`, `#5b6b7b` |
| Koyu zeminde metin | `#dbe8f1`, `#b9d0e0`, `#a9c3d6`, `#93b0c6` |
| Bilgi şeridi | kenarlık `#cfe0ee`, zemin `#f2f8fc`, metin `#2b4d66` |
| Başarı şeridi | kenarlık `#b7dcc6`, zemin `#f1faf4`, metin `#40624f` |
| Drop zone | kenarlık `#a8bccd` → `#0d4c7a`, zemin `#f4f8fb` → `#edf4f9` (hover) / `#e6f0f8` (drag) |
| Bağlantı | `#0d4c7a`, hover `#b41028`; koyu zeminde `#8fc7ee` |

**Tipografi**
- Gövde: `"Source Sans 3", system-ui, sans-serif` — 400/600/700
- Sayısal vurgular: `"Source Serif 4", Georgia, serif` — 600
- Ölçek: 13px (üst şerit, breadcrumb, yardımcı), 14px (bildirim, altbilgi, rozet), 15px (form, tablo, menü, adım metni), 16px (panel başlığı, buton, SSS sorusu), 19px (site adı), 20px (istatistik)
- Gövde `line-height: 1.55`; logo bloğu 1.15
- `letter-spacing`: `-.01em` site adında, `.02em` menü başlığında, `.04em` logo rozetinde

**Boşluk:** 4 tabanlı — 7, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 34, 48

**Köşe yarıçapı:** her yerde `2px` (kurumsal, sert görünüm). Daireler `50%`.

**Gölge:** yok. Derinlik yalnızca 1px kenarlıklarla kurulur.

**Konteyner:** `max-width: 1180px`; içerik gridi `268px 1fr`, `gap: 22px`.

## Responsive
Prototip masaüstü genişliğinde tasarlandı. Uygulamada önerilen kırılma noktaları:
- `< 900px`: içerik gridi tek kolona düşer, sol menü panellerin üstüne yatay kaydırılabilir bir şeride veya normal listeye dönüşür
- `< 700px`: form satırlarının `190px 1fr` gridi tek kolona düşer (etiket üstte); İşlem adımları 3 kolondan 1'e; Gizlilik paneli tek kolona, istatistik gridi 2×2 kalır
- Dokunmatik hedefler en az 44px yükseklikte olmalı; butonların dikey padding'ini `13px`e çıkarın

## Erişilebilirlik
- Drop zone `<label>` + gizli `<input>` yapısındadır; klavye ile odaklanabilir olmalı (`tabindex` yerine input'un görünür odak halkasını taşıyın)
- Durum değişimlerinde (`working` → `done`) durum satırını `aria-live="polite"` yapın
- Zorunlu alan `*` işaretleri renkle birlikte `aria-required` ile de belirtilmeli
- Kırmızı/lacivert metin kontrastları AA'yı geçer; `#5b6b7b` üzeri beyaz 15px altına inmeyin

## Assets
Harici görsel yok. Logo, PDF ikonu ve tüm rozetler saf CSS ile çizilmiştir (kutu + konumlanmış çizgiler). Yazı tipleri Google Fonts'tan yüklenir:
`https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&family=Source+Serif+4:opsz,wght@8..60,600&display=swap`
Üretimde yazı tiplerini kendi sunucunuzdan servis etmek isterseniz `woff2` dosyalarını indirip `@font-face` ile tanımlayın; site çevrimdışı çalıştığını iddia ettiği için bu tercih edilir.

## Files
- `udf-cevirici.dc.html` — tam tasarım referansı (tüm markup, stil ve durum mantığı)
