/**
 * Express sunucusu — giriş noktası.
 * Heroku: PORT ortam değişkeni atanır; Procfile `web: node index.js` ile başlar.
 */

const express = require("express");
const path = require("path");
const fs = require("fs-extra");

const { registerConvertRoutes, MAX_FILE_SIZE } = require("./routes/convert.routes");

const app = express();
const PORT = process.env.PORT || 3000;
const rootDir = __dirname;

const uploadsDir = path.join(rootDir, "uploads");
const outputsDir = path.join(rootDir, "outputs");

// Klasörler yoksa oluştur (Heroku geçici dosya sistemi dahil)
fs.ensureDirSync(uploadsDir);
fs.ensureDirSync(outputsDir);

// Şablonlardan veya API’den erişim için yol bilgisini sakla
app.locals.uploadsDir = uploadsDir;
app.locals.outputsDir = outputsDir;
app.locals.maxFileSize = MAX_FILE_SIZE;

// Basit gövde ayrıştırıcı (multipart isteklerde multer kullanılır; bu alanlar yine de okunabilir)
app.use(express.urlencoded({ extended: true }));

// Statik ön yüz (CSS, JS)
app.use(express.static(path.join(rootDir, "public")));

// Dönüştürme API’si
registerConvertRoutes(app, { uploadsDir, outputsDir });

// Ana sayfa
app.get("/", (req, res) => {
  res.sendFile(path.join(rootDir, "views", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Dosya dönüştürücü çalışıyor: http://localhost:${PORT}`);
  console.log(`Maksimum yükleme boyutu: ${MAX_FILE_SIZE / (1024 * 1024)} MB`);
});
