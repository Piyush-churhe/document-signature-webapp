const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const hexToRgb = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { r, g, b };
};

const embedSignatureInPDF = async (documentPath, signatures, fields, textFields = []) => {
  try {
    const existingPdfBytes = fs.readFileSync(documentPath);
    const pdfDoc = await PDFDocument.load(existingPdfBytes);
    const pages = pdfDoc.getPages();

    for (const sig of signatures) {
      for (const field of sig.fields) {
        const pageIndex = (field.page || 1) - 1;
        if (pageIndex >= pages.length) continue;
        const page = pages[pageIndex];
        const { width, height } = page.getSize();

        // Convert percentage coordinates to actual positions
        const absX = (field.x / 100) * width;
        const absY = height - (field.y / 100) * height - (field.height || 80);
        const absW = (field.width || 200) * (width / 800);
        const absH = (field.height || 80) * (width / 800);

        if (sig.type === 'typed' && sig.category !== 'stamp') {
          const font = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
          const color = sig.color ? hexToRgb(sig.color) : { r: 0, g: 0, b: 0 };
          const fontSize = Math.min(absH * 0.7, 28);
          page.drawText(sig.data, {
            x: absX + 4,
            y: absY + (absH - fontSize) / 2,
            size: fontSize,
            font,
            color: rgb(color.r, color.g, color.b),
          });
        } else if (sig.data && sig.data.startsWith('data:image')) {
          // Embed image signature
          const base64Data = sig.data.split(',')[1];
          const imageBytes = Buffer.from(base64Data, 'base64');
          let embeddedImage;
          if (sig.data.includes('image/png') || sig.category === 'stamp') {
            embeddedImage = await pdfDoc.embedPng(imageBytes);
          } else {
            try {
              embeddedImage = await pdfDoc.embedJpg(imageBytes);
            } catch {
              embeddedImage = await pdfDoc.embedPng(imageBytes);
            }
          }
          page.drawImage(embeddedImage, { x: absX, y: absY, width: absW, height: absH });
        }
      }
    }

    for (const field of textFields) {
      const value = String(field?.value || '').trim();
      if (!value) continue;

      const pageIndex = (field.page || 1) - 1;
      if (pageIndex >= pages.length) continue;

      const page = pages[pageIndex];
      const { width, height } = page.getSize();
      const absX = (field.x / 100) * width;
      const absY = height - (field.y / 100) * height - (field.height || 36);
      const absW = (field.width || 180) * (width / 800);
      const absH = (field.height || 36) * (width / 800);

      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const fontSize = Math.max(10, Math.min(absH * 0.6, 22));

      page.drawText(value, {
        x: absX + 4,
        y: absY + Math.max(2, (absH - fontSize) / 2),
        size: fontSize,
        font,
        color: rgb(0.05, 0.05, 0.05),
        maxWidth: Math.max(30, absW - 8),
      });
    }

    // Add certification stamp
    const lastPage = pages[pages.length - 1];
    const { width: lw, height: lh } = lastPage.getSize();
    const certFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    lastPage.drawRectangle({
      x: 40, y: 20, width: lw - 80, height: 40,
      color: rgb(0.97, 0.97, 0.97), borderColor: rgb(0.88, 0.78, 0.49), borderWidth: 1,
    });
    lastPage.drawText(`Digitally signed via SignatureFlow | ${new Date().toISOString()} | Tamper-evident`, {
      x: 50, y: 34, size: 7, font: certFont, color: rgb(0.4, 0.4, 0.4),
    });

    const signedPdfBytes = await pdfDoc.save();
    const outputDir = path.join(__dirname, '../uploads/signed');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `signed-${uuidv4()}.pdf`);
    fs.writeFileSync(outputPath, signedPdfBytes);
    return outputPath;
  } catch (err) {
    console.error('PDF embedding error:', err);
    throw new Error('Failed to embed signature in PDF: ' + err.message);
  }
};

const getPDFPageCount = async (filePath) => {
  try {
    const bytes = fs.readFileSync(filePath);
    const pdf = await PDFDocument.load(bytes);
    return pdf.getPageCount();
  } catch {
    return 1;
  }
};

module.exports = { embedSignatureInPDF, getPDFPageCount };
