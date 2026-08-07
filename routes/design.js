const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { uploadBuffer, uploadBase64 } = require('../services/cloudinary');
const Product = require('../models/Product');
const Design = require('../models/Design');

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

    // Save design metadata to MongoDB Atlas
    const designData = {
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
    };

    const design = await Design.create(designData);

    // Respond immediately
    res.status(201).json({ success: true, designId, design });
  } catch (err) {
    console.error('Save design error:', err);
    res.status(500).json({ error: 'Failed to save design. Please try again.' });
  }
});

// GET /api/design/:id
router.get('/design/:id', async (req, res) => {
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
    const design = await Design.findOne({
      $or: [
        { id: req.params.id },
        ...(isObjectId ? [{ _id: req.params.id }] : [])
      ]
    });
    if (design) {
      return res.json(design);
    }



    res.status(404).json({ error: 'Design not found.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/designs  (Admin – list all saved designs)
router.get('/designs', async (req, res) => {
  try {
    const designs = await Design.find({}).sort({ createdAt: -1 });
    res.json(designs);
  } catch (err) {
    console.error('List designs error:', err);
    res.status(500).json({ error: 'Failed to fetch designs.' });
  }
});

// GET /api/designs/export  (Admin – download designs as Excel)
router.get('/designs/export', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const designs = await Design.find({}).sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Annalakshmi Admin';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Saved Designs');

    // Header styling
    sheet.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Customer Name', key: 'name', width: 25 },
      { header: 'Mobile Number', key: 'mobile', width: 18 },
      { header: 'Bag ID', key: 'bagId', width: 20 },
      { header: 'Bag Color', key: 'bagColor', width: 15 },
      { header: 'Preview URL', key: 'previewUrl', width: 45 },
      { header: 'Design ID', key: 'designId', width: 38 },
      { header: 'Created Date', key: 'createdAt', width: 22 },
    ];

    // Style header row
    sheet.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C3E50' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });

    // Add data rows
    designs.forEach((d, i) => {
      sheet.addRow({
        sno: i + 1,
        name: d.name || 'N/A',
        mobile: d.mobile || 'N/A',
        bagId: d.bagId || 'N/A',
        bagColor: d.bagColor || 'N/A',
        previewUrl: d.previewUrl || '',
        designId: d.id,
        createdAt: d.createdAt
          ? new Date(d.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
          : '',
      });
    });

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=designs_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Export designs error:', err);
    res.status(500).json({ error: 'Failed to export designs.' });
  }
});

module.exports = router;
