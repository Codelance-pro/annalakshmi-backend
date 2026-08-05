const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('../middleware/auth');
const { appendDesignSubmission } = require('../services/sheets');
const { uploadBuffer, uploadBase64 } = require('../services/cloudinary');

// Ensure directories exist
const uploadsDir = path.join(__dirname, '..', 'uploads');
const designsDir = path.join(__dirname, '..', 'designs');
[uploadsDir, designsDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Multer memory storage for artwork uploads to Cloudinary
const artworkStorage = multer.memoryStorage();

const artworkUpload = multer({
  storage: artworkStorage,
  fileFilter: (req, file, cb) => {
    const allowed = /^image\/(jpeg|jpg|png)$/;
    const extAllowed = /\.(jpeg|jpg|png)$/i;
    if (allowed.test(file.mimetype) && extAllowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Only PNG, JPG, and JPEG files are allowed.'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

// POST /api/upload  (Public)
router.post('/upload', (req, res) => {
  artworkUpload.single('artwork')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File is too large. Maximum size is 5 MB.' });
      }
      return res.status(400).json({ error: err.message });
    }
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    try {
      const cloudinaryUrl = await uploadBuffer(req.file.buffer, 'annalakshmi/artworks');
      res.json({ success: true, url: cloudinaryUrl, filename: req.file.originalname });
    } catch (uploadErr) {
      console.error('Cloudinary artwork upload error:', uploadErr);
      res.status(500).json({ error: 'Failed to upload artwork to cloud storage.' });
    }
  });
});

// CSV logging helper
const csvPath = path.join(__dirname, '..', 'designs.csv');

function appendToCsv(design, userName, bagModelName) {
  const headers = 'Design ID,Date & Time,Customer Name,Mobile Number,Bag Model,Bag Color,Artwork URL,Preview URL\n';
  
  const clean = (val) => {
    if (!val) return '';
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const row = [
    clean(design.id),
    clean(new Date(design.createdAt).toLocaleString('en-IN')),
    clean(userName),
    clean(design.mobile),
    clean(bagModelName),
    clean(design.bagColor),
    clean(design.artworkUrl),
    clean(design.previewUrl),
  ].join(',') + '\n';

  try {
    if (!fs.existsSync(csvPath)) {
      fs.writeFileSync(csvPath, headers + row, 'utf-8');
    } else {
      fs.appendFileSync(csvPath, row, 'utf-8');
    }
    console.log(`📊 Logged design ${design.id} to designs.csv`);
  } catch (err) {
    console.error('CSV append error:', err.message);
  }
}

// POST /api/save-design  (Public)
router.post('/save-design', async (req, res) => {
  try {
    const {
      bagId,
      mobile,
      name,
      artworkUrl,
      previewImage, // base64 data URL
      position,     // { x, y }
      size,         // { width, height }
      rotation,
      layers,       // full layers config
      bagColor,     // selected bag color
    } = req.body;

    const designId = uuidv4();
    const timestamp = new Date().toISOString();

    // Upload preview image (base64 PNG) to Cloudinary
    let previewUrl = null;
    if (previewImage && previewImage.startsWith('data:image/')) {
      try {
        previewUrl = await uploadBase64(previewImage, 'annalakshmi/previews');
      } catch (cErr) {
        console.error('Cloudinary preview upload error:', cErr.message);
      }
    }

    // Save design metadata
    const design = {
      id: designId,
      bagId: bagId || null,
      name: name || 'N/A',
      mobile: mobile || 'N/A',
      artworkUrl: artworkUrl || '',
      previewUrl: previewUrl,
      position: position || { x: 0, y: 0 },
      size: size || { width: 0, height: 0 },
      rotation: rotation || 0,
      layers: layers || [],
      bagColor: bagColor || 'natural',
      timestamp,
      createdAt: timestamp,
    };

    const metaPath = path.join(designsDir, `design_${designId}.json`);
    fs.writeFileSync(metaPath, JSON.stringify(design, null, 2));

    // Resolve Bag Model Name from products.json
    let bagModelName = bagId || 'Default Tote';
    try {
      const DATA_FILE = path.join(__dirname, '..', 'products.json');
      if (fs.existsSync(DATA_FILE)) {
        const products = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        const product = products.find(p => p.id === bagId);
        if (product) bagModelName = product.name;
      }
    } catch (pErr) {
      console.warn('Error reading products.json for CSV name lookup:', pErr.message);
    }

    // Save details in Excel/CSV
    appendToCsv(design, name, bagModelName);

    // Fire Google Sheets logging in background — don't block the HTTP response.
    // If Sheets fails (auth error, quota, network), the design is still saved locally.
    appendDesignSubmission(design, name, bagModelName).catch(sheetsErr => {
      console.warn('⚠️  Google Sheets logging failed (design saved locally):', sheetsErr.message);
    });

    // Respond immediately — don't wait for Sheets
    res.status(201).json({ success: true, designId, design });
  } catch (err) {
    console.error('Save design error:', err);
    res.status(500).json({ error: 'Failed to save design. Please try again.' });
  }
});

// GET /api/design/:id
router.get('/design/:id', (req, res) => {
  const metaPath = path.join(designsDir, `design_${req.params.id}.json`);
  if (!fs.existsSync(metaPath)) {
    return res.status(404).json({ error: 'Design not found.' });
  }
  const design = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
  res.json(design);
});

module.exports = router;
