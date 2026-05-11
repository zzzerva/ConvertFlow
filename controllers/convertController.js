/**
 * HTTP isteklerini karşılar: dosya yükleme (multer sonrası) ve indirme.
 * Asıl dönüştürme conversionService içinde yapılır.
 */

const path = require("path");
const fs = require("fs-extra");

const { runConversion } = require("./conversionService");

/** outputs içindeki dosya adı doğrulaması (path traversal engeli) */
const OUTPUT_NAME_RE = /^converted-\d+-\d+\.(txt|pdf|docx)$/i;

/**
 * POST /api/convert — multipart: file + conversionType
 */
async function postConvert(req, res) {
  let uploadedPath = null;
  try {
    if (!req.file) {
      return res.status(400).json({ ok: false, message: "Lütfen bir dosya seçin veya sürükleyip bırakın." });
    }
    uploadedPath = req.file.path;

    const conversionType = (req.body && req.body.conversionType) || "";
    if (!conversionType) {
      await fs.remove(uploadedPath).catch(() => {});
      uploadedPath = null;
      return res.status(400).json({ ok: false, message: "Dönüşüm türünü seçin." });
    }

    const outputsDir = req.app.locals.outputsDir;
    const uploadsDir = req.app.locals.uploadsDir;

    const result = await runConversion(conversionType, uploadedPath, req.file.originalname, {
      uploadsDir,
      outputsDir,
    });
    uploadedPath = null;

    return res.json({
      ok: true,
      fileName: result.fileName,
      message: result.message,
    });
  } catch (err) {
    if (uploadedPath) await fs.remove(uploadedPath).catch(() => {});
    const msg = err && err.message ? err.message : "Dönüşüm sırasında beklenmeyen bir hata oluştu.";
    return res.status(400).json({ ok: false, message: msg });
  }
}

/**
 * GET /api/download/:fileId — üretilen dosyayı gönderir
 */
async function getDownload(req, res) {
  try {
    const base = path.basename(req.params.fileId || "");
    if (!OUTPUT_NAME_RE.test(base)) {
      return res.status(400).send("Geçersiz dosya adı.");
    }
    const full = path.join(req.app.locals.outputsDir, base);
    if (!(await fs.pathExists(full))) {
      return res.status(404).send("Dosya bulunamadı veya süresi doldu.");
    }
    return res.download(full, base, (err) => {
      if (err && !res.headersSent) {
        res.status(500).send("İndirme başlatılamadı.");
      }
    });
  } catch {
    return res.status(500).send("Sunucu hatası.");
  }
}

module.exports = {
  postConvert,
  getDownload,
};
