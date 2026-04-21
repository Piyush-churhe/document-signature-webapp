const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const ensureUploadDir = (relativePath) => {
  const absolutePath = path.join(__dirname, relativePath);
  fs.mkdirSync(absolutePath, { recursive: true });
  return absolutePath;
};

const pdfStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ensureUploadDir('../uploads/pdfs')),
  filename: (req, file, cb) => cb(null, `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`),
});

const stampStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ensureUploadDir('../uploads/stamps')),
  filename: (req, file, cb) => cb(null, `stamp-${uuidv4()}${path.extname(file.originalname)}`),
});

const pdfFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new Error('Only PDF files are allowed'), false);
};

const imageFilter = (req, file, cb) => {
  if (['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only PNG, JPG, SVG files are allowed'), false);
};

const uploadPDF = multer({ storage: pdfStorage, fileFilter: pdfFilter, limits: { fileSize: 20 * 1024 * 1024 } });
const uploadStamp = multer({ storage: stampStorage, fileFilter: imageFilter, limits: { fileSize: 5 * 1024 * 1024 } });

module.exports = { uploadPDF, uploadStamp };
