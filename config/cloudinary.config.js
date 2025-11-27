// config/cloudinary.config.js

// Charge les variables d’environnement avant tout usage
require('dotenv').config();

const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// === STORAGE PHOTOS (images uniquement) ===
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'gestion-stock',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp']
  }
});

// === STORAGE BDL (PDF, PNG, etc.) ===
const storageBDL = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'gestion-stock/bdl',
    resource_type: 'raw', // <=== OBLIGATOIRE pour PDF
    allowed_formats: ['pdf', 'png', 'jpg', 'jpeg'],
    use_filename: true,
    unique_filename: true
  }
});

const uploadBDL = multer({ storage: storageBDL });

module.exports = { cloudinary, storage, uploadBDL };
