require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const mongoose = require('mongoose');

const connectDB = require('./config/db');
const Product = require('./models/Product');
const Inquiry = require('./models/Inquiry');

// Custom routes
const otpRoutes = require('./routes/otp');
const designRoutes = require('./routes/design');

const app = express();
const PORT = process.env.PORT || 5000;

// Connect to MongoDB Atlas
connectDB();

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174', "https://annalakshmi-ten.vercel.app"] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/designs', express.static(path.join(__dirname, 'designs')));

// Ensure directories exist
const uploadsDir = path.join(__dirname, 'uploads');
const designsDir = path.join(__dirname, 'designs');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
if (!fs.existsSync(designsDir)) fs.mkdirSync(designsDir, { recursive: true });

// ─── CUSTOM FEATURE ROUTES ─────────────────────────────────────────────────
app.use('/api', otpRoutes);
app.use('/api', designRoutes);

const { uploadBuffer } = require('./services/cloudinary');

// Multer config for image uploads (Memory Storage for direct Cloudinary upload)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp|gif/;
    const ok = allowed.test(file.mimetype) && allowed.test(path.extname(file.originalname).toLowerCase());
    cb(ok ? null : new Error('Only image files allowed'), ok);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// ─── ROUTES ────────────────────────────────────────────────────────────────

// GET all products (with optional category filter)
app.get('/api/products', async (req, res) => {
  try {
    const { category, latest, customizableOnly, includeCustomizable } = req.query;
    let query = {};

    if (customizableOnly === 'true') {
      query.$or = [{ isCustomizableOnly: true }, { tags: 'customizable' }];
    } else if (includeCustomizable === 'true') {
      // Keep all, do not filter out customizable-only templates
    } else {
      // By default, exclude customizable template bags from standard catalog list
      query.isCustomizableOnly = { $ne: true };
    }

    if (category) query.category = category;
    if (latest === 'true') query.isNew = true;

    const products = await Product.find(query).sort({ createdAt: -1 });
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single product
app.get('/api/products/:id', async (req, res) => {
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
    const product = await Product.findOne({
      $or: [
        { id: req.params.id },
        ...(isObjectId ? [{ _id: req.params.id }] : [])
      ]
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST create product (admin)
app.post('/api/products', upload.array('images', 6), async (req, res) => {
  try {
    const { name, description, category, tags, isNew, featured, isCustomizableOnly } = req.body;
    if (!name || !category) return res.status(400).json({ error: 'Name and category are required' });

    let images = [];
    if (req.files && req.files.length > 0) {
      images = await Promise.all(
        req.files.map(f => uploadBuffer(f.buffer, 'annalakshmi/products'))
      );
    }

    const product = await Product.create({
      id: uuidv4(),
      name,
      description: description || '',
      category,
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      images,
      isNew: isNew === 'true',
      featured: featured === 'true',
      isCustomizableOnly: isCustomizableOnly === 'true',
    });

    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update product (admin)
app.put('/api/products/:id', upload.array('images', 6), async (req, res) => {
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
    const product = await Product.findOne({
      $or: [
        { id: req.params.id },
        ...(isObjectId ? [{ _id: req.params.id }] : [])
      ]
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const { name, description, category, tags, isNew, featured, isCustomizableOnly, removeImages } = req.body;

    let images = [...(product.images || [])];
    if (removeImages) {
      const toRemove = JSON.parse(removeImages);
      images = images.filter(img => !toRemove.includes(img));
    }

    if (req.files && req.files.length > 0) {
      const newCloudinaryUrls = await Promise.all(
        req.files.map(f => uploadBuffer(f.buffer, 'annalakshmi/products'))
      );
      images = [...images, ...newCloudinaryUrls];
    }

    if (name !== undefined) product.name = name;
    if (description !== undefined) product.description = description;
    if (category !== undefined) product.category = category;
    if (tags !== undefined) product.tags = tags.split(',').map(t => t.trim());
    product.images = images;
    if (isNew !== undefined) product.isNew = isNew === 'true';
    if (featured !== undefined) product.featured = featured === 'true';
    if (isCustomizableOnly !== undefined) product.isCustomizableOnly = isCustomizableOnly === 'true';

    await product.save();
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE product (admin)
app.delete('/api/products/:id', async (req, res) => {
  try {
    const isObjectId = mongoose.Types.ObjectId.isValid(req.params.id);
    const product = await Product.findOneAndDelete({
      $or: [
        { id: req.params.id },
        ...(isObjectId ? [{ _id: req.params.id }] : [])
      ]
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST inquiry
app.post('/api/inquiries', async (req, res) => {
  try {
    const { name, email, phone, message, productId } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: 'Name, email, and message are required' });

    const inquiry = await Inquiry.create({
      id: uuidv4(),
      name,
      email,
      phone,
      message,
      productId,
    });
    res.status(201).json({ message: 'Inquiry submitted successfully!', inquiry });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET all inquiries (admin)
app.get('/api/inquiries', async (req, res) => {
  try {
    const inquiries = await Inquiry.find().sort({ createdAt: -1 });
    res.json(inquiries);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Stats (admin dashboard)
app.get('/api/stats', async (req, res) => {
  try {
    const [total, jute, tote, wedding, newArrivals, featured, inquiries] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ category: 'jute' }),
      Product.countDocuments({ category: 'tote' }),
      Product.countDocuments({ category: 'wedding' }),
      Product.countDocuments({ isNew: true }),
      Product.countDocuments({ featured: true }),
      Inquiry.countDocuments(),
    ]);
    res.json({
      total,
      jute,
      tote,
      wedding,
      newArrivals,
      featured,
      inquiries,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:");
  console.error(err);
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED REJECTION:");
  console.error(reason);
});

app.listen(PORT, () => console.log(`✅ Server running on http://localhost:${PORT}`));
