const fs = require('fs');
const path = require('path');

const uploadsRoot = path.resolve(__dirname, '../uploads');

const resolveExistingUploadPath = (candidatePath) => {
  if (!candidatePath || typeof candidatePath !== 'string') return null;

  const options = new Set();
  options.add(candidatePath);
  options.add(path.resolve(candidatePath));

  const uploadsMatch = candidatePath.match(/[\\/]uploads[\\/](.+)$/);
  if (uploadsMatch?.[1]) {
    const relativeUploadsPath = uploadsMatch[1].replace(/\\/g, '/');
    options.add(path.join(uploadsRoot, relativeUploadsPath));
  }

  const baseName = path.basename(candidatePath);
  if (baseName) {
    options.add(path.join(uploadsRoot, 'pdfs', baseName));
    options.add(path.join(uploadsRoot, 'signed', baseName));
    options.add(path.join(uploadsRoot, 'stamps', baseName));
  }

  for (const candidate of options) {
    try {
      if (candidate && fs.existsSync(candidate)) return candidate;
    } catch {
      // Ignore invalid path candidates and continue trying alternatives.
    }
  }

  return null;
};

module.exports = { resolveExistingUploadPath };
