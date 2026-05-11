/**
 * Dönüştürme API rotaları.
 * Multer yapılandırması burada: disk depolama, boyut sınırı, uploads klasörü.
 */

const express = require("express");
const path = require("path");
const multer = require("multer");
const fs = require("fs-extra");

const { postConvert, getDownload } = require("../controllers/convertController");

const router = express.Router();

/** Maksimum dosya boyutu (bayt) — güvenlik ve Heroku zaman aşımı için sınır */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function createUploadMiddleware(uploadsDir) {
  const storage = multer.diskStorage({
    destination: async (req, file, cb) => {
      await fs.ensureDir(uploadsDir);
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safeExt = ext && ext.length <= 8 ? ext : "";
      const name = `upload-${Date.now()}-${Math.round(Math.random() * 1e9)}${safeExt}`;
      cb(null, name);
    },
  });

  return multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE },
  });
}

/** Multer hatalarını (özellikle boyut sınırı) JSON ile döndürür */
function handleUpload(upload) {
  return (req, res, next) => {
    upload.single("file")(req, res, (err) => {
      if (!err) return next();
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          ok: false,
          message: `Dosya çok büyük. En fazla ${MAX_FILE_SIZE / (1024 * 1024)} MB yükleyebilirsiniz.`,
        });
      }
      return res.status(400).json({
        ok: false,
        message: err.message ? `Yükleme hatası: ${err.message}` : "Yükleme sırasında bir hata oluştu.",
      });
    });
  };
}

function registerConvertRoutes(app, dirs) {
  const upload = createUploadMiddleware(dirs.uploadsDir);

  router.post("/convert", handleUpload(upload), postConvert);
  router.get("/download/:fileId", getDownload);

  app.use("/api", router);
}

module.exports = { registerConvertRoutes, MAX_FILE_SIZE };
