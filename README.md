# ConvertFlow

Node.js ve Express ile çalışan, tarayıcıdan kullanılan **dosya dönüştürme** web uygulaması. PDF, TXT, DOCX ve görüntü (JPG/PNG) formatları arasında seçilen türlere göre dönüşüm yapar.

## Özellikler

- Sürükle-bırak ve dosya seçme ile yükleme
- Dönüşüm türü seçimi ve **Convert** ile işlem
- İşlem sonrası **İndir** bağlantısı
- Başarı / hata bildirimleri ve yükleme göstergesi
- Responsive arayüz (beyaz, mavi, açık gri tonları)
- Sunucuda geçici `uploads/` ve `outputs/` klasörleri; maksimum dosya boyutu **10 MB**

## Desteklenen dönüşümler

| Kaynak      | Hedef |
|------------|--------|
| PDF        | TXT    |
| TXT        | PDF    |
| JPG / PNG  | PDF    |
| PDF        | DOCX   |
| DOCX       | PDF    |

**Not:** PDF ↔ DOCX dönüşümlerinde sunucuda **LibreOffice** (`soffice`) kuruluysa `libreoffice-convert` ile daha zengin sonuç alınabilir. Kurulu değilse metin tabanlı yedek yollar devreye girer; biçimlendirme tam korunmayabilir. PDF metin çıkarmada `pdf-parse` yanında uyumluluk için **pdfjs-dist** kullanılır.

## Teknolojiler

- **Backend:** Express.js, Multer (dosya yükleme)
- **Frontend:** HTML, CSS, vanilla JavaScript
- **Kütüphaneler:** pdf-parse, pdfjs-dist, pdf-lib, mammoth, docx, sharp, fs-extra, libreoffice-convert

## Gereksinimler

- [Node.js](https://nodejs.org/) **18 veya üzeri** (`package.json` içinde `engines` ile belirtilir)

## Kurulum ve çalıştırma

```bash
git clone <repo-url>
cd <proje-klasörü>
npm install
npm start
```

Tarayıcıda: [http://localhost:3000](http://localhost:3000)

Yerelde port atanmazsa varsayılan **3000** kullanılır; production ortamında `PORT` ortam değişkeni kullanılır.

## Proje yapısı

```
├── index.js              # Express sunucusu, statik dosyalar, ana sayfa
├── package.json
├── Procfile              # Heroku: web süreci
├── public/               # CSS, JS (statik)
├── views/                # index.html
├── routes/               # API rotaları, Multer yapılandırması
├── controllers/          # İstek işleyicileri ve dönüştürme servisi
├── uploads/              # Geçici yüklemeler (.gitignore)
└── outputs/              # Üretilen dosyalar (.gitignore)
```

## API

| Metot  | Yol                        | Açıklama |
|--------|----------------------------|----------|
| `POST` | `/api/convert`             | `multipart/form-data`: alan `file` (dosya), `conversionType` (`pdf-to-txt`, `txt-to-pdf`, `image-to-pdf`, `pdf-to-docx`, `docx-to-pdf`) |
| `GET`  | `/api/download/:fileId`    | Dönüşüm sonrası dönen güvenli dosya adı ile indirme |

## Heroku ile dağıtım

- `Procfile` içeriği: `web: node index.js`
- `npm start` → `node index.js`
- `PORT` Heroku tarafından atanır; kodda `process.env.PORT || 3000` kullanılır.
- Dyno dosya sistemi **geçicidir**; `uploads/` ve `outputs/` yeniden başlatmada sıfırlanabilir. Kalıcı depolama için harici depolama (ör. S3) entegrasyonu gerekir.
- [Heroku Node.js desteği](https://devcenter.heroku.com/articles/nodejs-support) ve uygun stack kullanın.

## Güvenlik ve sınırlar

- Yükleme boyutu sunucuda sınırlıdır (varsayılan **10 MB**).
- İndirme yolu yalnızca üretilen güvenli dosya adlarıyla kısıtlıdır.

## Lisans

MIT
