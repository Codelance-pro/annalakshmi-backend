require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Custom routes
const otpRoutes = require('./routes/otp');
const designRoutes = require('./routes/design');

const app = express();
const PORT = process.env.PORT || 5000;

 //hello
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

// Data store (file-based JSON for simplicity)
const DATA_FILE = path.join(__dirname, 'products.json');

const getProducts = () => {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
};

const saveProducts = (products) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify(products, null, 2));
};

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
app.get('/api/products', (req, res) => {
  let products = getProducts();
  const { category, latest, customizableOnly, includeCustomizable } = req.query;

  if (customizableOnly === 'true') {
    products = products.filter(p => p.isCustomizableOnly === true || (p.tags && p.tags.includes('customizable')));
  } else if (includeCustomizable === 'true') {
    // Keep all, do not filter out customizable-only templates
  } else {
    // By default, exclude customizable template bags from standard catalog list
    products = products.filter(p => p.isCustomizableOnly !== true);
  }

  if (category) products = products.filter(p => p.category === category);
  if (latest === 'true') products = products.filter(p => p.isNew);
  products.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(products);
});

// GET single product
app.get('/api/products/:id', (req, res) => {
  const products = getProducts();
  const product = products.find(p => p.id === req.params.id);
  if (!product) return res.status(404).json({ error: 'Product not found' });
  res.json(product);
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

    const product = {
      id: uuidv4(),
      name,
      description: description || '',
      category,
      tags: tags ? tags.split(',').map(t => t.trim()) : [],
      images,
      isNew: isNew === 'true',
      featured: featured === 'true',
      isCustomizableOnly: isCustomizableOnly === 'true',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const products = getProducts();
    products.push(product);
    saveProducts(products);
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update product (admin)
app.put('/api/products/:id', upload.array('images', 6), async (req, res) => {
  try {
    const products = getProducts();
    const idx = products.findIndex(p => p.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Product not found' });

    const { name, description, category, tags, isNew, featured, isCustomizableOnly, removeImages } = req.body;
    const existing = products[idx];

    let images = [...(existing.images || [])];
    // Remove specified images
    if (removeImages) {
      const toRemove = JSON.parse(removeImages);
      toRemove.forEach(imgPath => {
        if (imgPath.startsWith('/uploads/')) {
          const fullPath = path.join(__dirname, imgPath.replace('/uploads/', 'uploads/'));
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        }
      });
      images = images.filter(img => !toRemove.includes(img));
    }
    // Add new uploads to Cloudinary
    if (req.files && req.files.length > 0) {
      const newCloudinaryUrls = await Promise.all(
        req.files.map(f => uploadBuffer(f.buffer, 'annalakshmi/products'))
      );
      images = [...images, ...newCloudinaryUrls];
    }

    products[idx] = {
      ...existing,
      name: name || existing.name,
      description: description !== undefined ? description : existing.description,
      category: category || existing.category,
      tags: tags ? tags.split(',').map(t => t.trim()) : existing.tags,
      images,
      isNew: isNew !== undefined ? isNew === 'true' : existing.isNew,
      featured: featured !== undefined ? featured === 'true' : existing.featured,
      isCustomizableOnly: isCustomizableOnly !== undefined ? isCustomizableOnly === 'true' : existing.isCustomizableOnly,
      updatedAt: new Date().toISOString(),
    };

    saveProducts(products);
    res.json(products[idx]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE product (admin)
app.delete('/api/products/:id', (req, res) => {
  const products = getProducts();
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Product not found' });

  // Delete associated images
  products[idx].images.forEach(imgPath => {
    const fullPath = path.join(__dirname, imgPath);
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  });

  products.splice(idx, 1);
  saveProducts(products);
  res.json({ message: 'Product deleted successfully' });
});

// POST inquiry
app.post('/api/inquiries', (req, res) => {
  const { name, email, phone, message, productId } = req.body;
  if (!name || !email || !message) return res.status(400).json({ error: 'Name, email, and message are required' });

  const INQUIRIES_FILE = path.join(__dirname, 'inquiries.json');
  const inquiries = fs.existsSync(INQUIRIES_FILE) ? JSON.parse(fs.readFileSync(INQUIRIES_FILE)) : [];
  inquiries.push({ id: uuidv4(), name, email, phone, message, productId, createdAt: new Date().toISOString() });
  fs.writeFileSync(INQUIRIES_FILE, JSON.stringify(inquiries, null, 2));
  res.status(201).json({ message: 'Inquiry submitted successfully!' });
});

// GET all inquiries (admin)
app.get('/api/inquiries', (req, res) => {
  const INQUIRIES_FILE = path.join(__dirname, 'inquiries.json');
  const inquiries = fs.existsSync(INQUIRIES_FILE) ? JSON.parse(fs.readFileSync(INQUIRIES_FILE)) : [];
  inquiries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(inquiries);
});

// Stats (admin dashboard)
app.get('/api/stats', (req, res) => {
  const products = getProducts();
  const INQUIRIES_FILE = path.join(__dirname, 'inquiries.json');
  const inquiries = fs.existsSync(INQUIRIES_FILE) ? JSON.parse(fs.readFileSync(INQUIRIES_FILE)) : [];
  res.json({
    total: products.length,
    jute: products.filter(p => p.category === 'jute').length,
    tote: products.filter(p => p.category === 'tote').length,
    wedding: products.filter(p => p.category === 'wedding').length,
    newArrivals: products.filter(p => p.isNew).length,
    featured: products.filter(p => p.featured).length,
    inquiries: inquiries.length,
  });
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
