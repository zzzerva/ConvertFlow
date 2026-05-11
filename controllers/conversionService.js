/**
 * Dönüştürme mantığı: PDF/TXT/DOCX/görüntü arasında dönüşümler.
 *
 * Notlar (başlangıç seviyesi):
 * - PDF → TXT: pdf-parse ile metin çıkarılır.
 * - TXT → PDF ve düz metin → PDF: pdf-lib ile A4 sayfalarına yazılır.
 * - JPG/PNG → PDF: sharp ile piksel düzeni, pdf-lib ile PDF’e gömülür.
 * - PDF → DOCX / DOCX → PDF: Önce LibreOffice (kuruluysa) denenir; yoksa
 *   metin tabanlı yedek yol kullanılır (biçimlendirme kaybolabilir).
 * - html-pdf paketi PhantomJS gerektirdiği için bu projede kullanılmadı;
 *   metin tabanlı PDF üretimi pdf-lib ile yapılır.
 * - pdf-parse bazı PDF’lerde hata verebildiği için metin çıkarma yoluna
 *   pdfjs-dist (3.x, legacy build) yedek olarak eklendi.
 * - libreoffice-convert: Sunucuda LibreOffice (soffice) varsa DOCX↔PDF ve
 *   PDF→DOCX için tercih edilir; yoksa mammoth / docx / pdf-lib yedekleri devreye girer.
 */

const fs = require("fs-extra");
const path = require("path");
const { promisify } = require("util");
const pdfParse = require("pdf-parse");
// pdf-parse bazı modern PDF sıkıştırmalarında hata verebilir; bu durumda pdfjs devreye girer.
const pdfjsLib = require("pdfjs-dist/legacy/build/pdf.js");
const { PDFDocument, StandardFonts } = require("pdf-lib");

try {
  pdfjsLib.GlobalWorkerOptions.workerSrc = require.resolve(
    "pdfjs-dist/legacy/build/pdf.worker.js"
  );
} catch {
  /* worker yolu bulunamazsa pdfjs yine de çoğu ortamda çalışır */
}
const mammoth = require("mammoth");
const sharp = require("sharp");
const { Document, Packer, Paragraph, TextRun } = require("docx");

let libreConvert = null;
try {
  libreConvert = promisify(require("libreoffice-convert").convert);
} catch {
  libreConvert = null;
}

/** İzin verilen dönüşüm anahtarları (form/select ile aynı olmalı) */
const CONVERSION_TYPES = {
  PDF_TO_TXT: "pdf-to-txt",
  TXT_TO_PDF: "txt-to-pdf",
  IMAGE_TO_PDF: "image-to-pdf",
  PDF_TO_DOCX: "pdf-to-docx",
  DOCX_TO_PDF: "docx-to-pdf",
};

const A4_W = 595;
const A4_H = 842;
const MARGIN = 48;
const FONT_SIZE = 11;
const LINE_HEIGHT = FONT_SIZE * 1.45;
const CHARS_PER_LINE = 92;

/**
 * Uzun metni sabit karakter genişliğinde satırlara böler (basit sarmalayıcı).
 */
function wrapPlainText(text) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  const lines = [];
  const paragraphs = normalized.split("\n");

  for (const para of paragraphs) {
    let rest = para;
    while (rest.length > CHARS_PER_LINE) {
      lines.push(rest.slice(0, CHARS_PER_LINE));
      rest = rest.slice(CHARS_PER_LINE);
    }
    lines.push(rest);
    lines.push("");
  }
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

/**
 * Düz metni pdf-lib ile çok sayfalı PDF’e çevirir.
 */
async function buildPdfFromPlainText(rawText) {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const lines = wrapPlainText(rawText);

  let page = pdfDoc.addPage([A4_W, A4_H]);
  let y = A4_H - MARGIN;

  const newPage = () => {
    page = pdfDoc.addPage([A4_W, A4_H]);
    y = A4_H - MARGIN;
  };

  for (const line of lines) {
    if (y < MARGIN + LINE_HEIGHT) newPage();
    const chunk = line.length > 8000 ? line.slice(0, 8000) + "…" : line;
    try {
      page.drawText(chunk || " ", {
        x: MARGIN,
        y,
        size: FONT_SIZE,
        font,
        maxWidth: A4_W - 2 * MARGIN,
      });
    } catch {
      const safe = chunk.replace(/[^\x20-\x7E]/g, "?");
      page.drawText(safe || " ", {
        x: MARGIN,
        y,
        size: FONT_SIZE,
        font,
        maxWidth: A4_W - 2 * MARGIN,
      });
    }
    y -= LINE_HEIGHT;
  }

  // useObjectStreams: false — pdf-parse (eski PDF.js) ile uyumluluk için
  const bytes = await pdfDoc.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

async function tryLibreOffice(inputBuffer, extWithDot) {
  if (!libreConvert) return null;
  try {
    return await libreConvert(inputBuffer, extWithDot, undefined);
  } catch {
    return null;
  }
}

/**
 * PDF içinden düz metin çıkarır: önce pdf-parse, başarısızsa pdfjs-dist.
 */
async function pdfBufferToText(buffer) {
  try {
    const data = await pdfParse(buffer);
    if (data && typeof data.text === "string" && data.text.trim().length > 0) {
      return data.text;
    }
  } catch {
    /* pdf-parse uyumsuz PDF — aşağıdaki yola düş */
  }

  // pdfjs, Node Buffer yerine düz Uint8Array ister (Buffer alt sınıfı kabul edilmeyebilir)
  const u8 = Uint8Array.from(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: u8, verbosity: 0 });
  const pdf = await loadingTask.promise;
  let fullText = "";
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const line = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
    fullText += line + "\n";
  }
  return fullText;
}

async function pdfToTxtFile(inputPath, outputDir) {
  const buffer = await fs.readFile(inputPath);
  const text = await pdfBufferToText(buffer);
  const base = `converted-${Date.now()}-${Math.round(Math.random() * 1e9)}.txt`;
  const outPath = path.join(outputDir, base);
  await fs.writeFile(outPath, text, "utf8");
  return { fileName: base, message: text.trim() ? "Dönüşüm tamamlandı." : "PDF içinde okunabilir metin bulunamadı; boş bir metin dosyası oluşturuldu." };
}

async function txtToPdfFile(inputPath, outputDir) {
  const raw = await fs.readFile(inputPath, "utf8");
  const pdfBuf = await buildPdfFromPlainText(raw);
  const base = `converted-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
  const outPath = path.join(outputDir, base);
  await fs.writeFile(outPath, pdfBuf);
  return { fileName: base, message: "TXT dosyası PDF’e dönüştürüldü." };
}

async function imageToPdfFile(inputPath, outputDir) {
  const inputBuf = await fs.readFile(inputPath);
  const meta = await sharp(inputBuf).metadata();
  const fmt = (meta.format || "").toLowerCase();

  const pdfDoc = await PDFDocument.create();
  let image;
  if (fmt === "jpeg" || fmt === "jpg") {
    const jpgBuf = await sharp(inputBuf).jpeg({ quality: 92 }).toBuffer();
    image = await pdfDoc.embedJpg(jpgBuf);
  } else {
    const pngBuf = await sharp(inputBuf).png().toBuffer();
    image = await pdfDoc.embedPng(pngBuf);
  }

  const w = image.width;
  const h = image.height;
  const page = pdfDoc.addPage([w, h]);
  page.drawImage(image, { x: 0, y: 0, width: w, height: h });

  const bytes = await pdfDoc.save({ useObjectStreams: false });
  const base = `converted-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
  const outPath = path.join(outputDir, base);
  await fs.writeFile(outPath, Buffer.from(bytes));
  return { fileName: base, message: "Görüntü tek sayfalık PDF olarak kaydedildi." };
}

async function pdfToDocxFile(inputPath, outputDir) {
  const buffer = await fs.readFile(inputPath);

  const lo = await tryLibreOffice(buffer, ".docx");
  if (lo && lo.length) {
    const base = `converted-${Date.now()}-${Math.round(Math.random() * 1e9)}.docx`;
    const outPath = path.join(outputDir, base);
    await fs.writeFile(outPath, lo);
    return { fileName: base, message: "LibreOffice ile PDF → DOCX dönüşümü yapıldı." };
  }

  const text = await pdfBufferToText(buffer);
  const parts = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const children =
    parts.length > 0
      ? parts.map((line) => new Paragraph({ children: [new TextRun(line)] }))
      : [new Paragraph({ children: [new TextRun(text || "")] })];

  const doc = new Document({
    sections: [{ properties: {}, children }],
  });
  const outBuffer = await Packer.toBuffer(doc);
  const base = `converted-${Date.now()}-${Math.round(Math.random() * 1e9)}.docx`;
  const outPath = path.join(outputDir, base);
  await fs.writeFile(outPath, outBuffer);
  return {
    fileName: base,
    message:
      "Metin tabanlı yedek yol kullanıldı (LibreOffice bulunamadı). Paragraflar düz metin olarak aktarıldı; özgün PDF düzeni korunmayabilir.",
  };
}

async function docxToPdfFile(inputPath, outputDir) {
  const buffer = await fs.readFile(inputPath);

  const lo = await tryLibreOffice(buffer, ".pdf");
  if (lo && lo.length) {
    const base = `converted-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
    const outPath = path.join(outputDir, base);
    await fs.writeFile(outPath, lo);
    return { fileName: base, message: "LibreOffice ile DOCX → PDF dönüşümü yapıldı." };
  }

  const extracted = await mammoth.extractRawText({ buffer });
  const raw = extracted.value || "";
  const pdfBuf = await buildPdfFromPlainText(raw);
  const base = `converted-${Date.now()}-${Math.round(Math.random() * 1e9)}.pdf`;
  const outPath = path.join(outputDir, base);
  await fs.writeFile(outPath, pdfBuf);
  return {
    fileName: base,
    message:
      "Metin tabanlı yedek yol kullanıldı (LibreOffice bulunamadı). DOCX içeriği düz metin olarak PDF’e aktarıldı.",
  };
}

function extOf(name) {
  return path.extname(name || "").toLowerCase();
}

/**
 * Yüklenen dosya adı ile seçilen dönüşümün uyumunu kontrol eder.
 */
function assertInputMatches(conversionType, originalName) {
  const ext = extOf(originalName);
  switch (conversionType) {
    case CONVERSION_TYPES.PDF_TO_TXT:
    case CONVERSION_TYPES.PDF_TO_DOCX:
      if (ext !== ".pdf") throw new Error("Bu dönüşüm için .pdf dosyası yükleyin.");
      break;
    case CONVERSION_TYPES.TXT_TO_PDF:
      if (ext !== ".txt") throw new Error("Bu dönüşüm için .txt dosyası yükleyin.");
      break;
    case CONVERSION_TYPES.IMAGE_TO_PDF:
      if (![".jpg", ".jpeg", ".png"].includes(ext)) {
        throw new Error("Bu dönüşüm için .jpg, .jpeg veya .png dosyası yükleyin.");
      }
      break;
    case CONVERSION_TYPES.DOCX_TO_PDF:
      if (ext !== ".docx") throw new Error("Bu dönüşüm için .docx dosyası yükleyin.");
      break;
    default:
      throw new Error("Geçersiz dönüşüm türü.");
  }
}

/**
 * @param {string} conversionType - CONVERSION_TYPES değerlerinden biri
 * @param {string} inputPath - Multer’ın kaydettiği tam yol
 * @param {string} originalName - Orijinal dosya adı (uzantı kontrolü için)
 * @param {{ uploadsDir: string, outputsDir: string }} dirs
 */
async function runConversion(conversionType, inputPath, originalName, dirs) {
  assertInputMatches(conversionType, originalName);
  const outputDir = dirs.outputsDir;

  try {
    let result;
    switch (conversionType) {
      case CONVERSION_TYPES.PDF_TO_TXT:
        result = await pdfToTxtFile(inputPath, outputDir);
        break;
      case CONVERSION_TYPES.TXT_TO_PDF:
        result = await txtToPdfFile(inputPath, outputDir);
        break;
      case CONVERSION_TYPES.IMAGE_TO_PDF:
        result = await imageToPdfFile(inputPath, outputDir);
        break;
      case CONVERSION_TYPES.PDF_TO_DOCX:
        result = await pdfToDocxFile(inputPath, outputDir);
        break;
      case CONVERSION_TYPES.DOCX_TO_PDF:
        result = await docxToPdfFile(inputPath, outputDir);
        break;
      default:
        throw new Error("Desteklenmeyen dönüşüm.");
    }
    return result;
  } finally {
    // Geçici yüklemeyi sil (disk dolmasını yavaşlatır)
    await fs.remove(inputPath).catch(() => {});
  }
}

module.exports = {
  CONVERSION_TYPES,
  runConversion,
  assertInputMatches,
};
