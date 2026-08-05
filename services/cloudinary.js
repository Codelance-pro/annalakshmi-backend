const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dqydfp0xz',
  api_key: process.env.CLOUDINARY_API_KEY || '861551415222197',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'ltrRoYAS68zwrJCgOUuYqL_qb6o',
});

/**
 * Upload a Buffer to Cloudinary
 * @param {Buffer} buffer 
 * @param {string} folder 
 * @returns {Promise<string>} Secure URL of uploaded image
 */
const uploadBuffer = (buffer, folder = 'annalakshmi') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
};

/**
 * Upload a base64 string (e.g. data:image/png;base64,...) to Cloudinary
 * @param {string} base64Data 
 * @param {string} folder 
 * @returns {Promise<string>} Secure URL of uploaded image
 */
const uploadBase64 = async (base64Data, folder = 'annalakshmi/previews') => {
  const result = await cloudinary.uploader.upload(base64Data, {
    folder,
    resource_type: 'image',
  });
  return result.secure_url;
};

/**
 * Upload a local file path to Cloudinary
 * @param {string} filePath 
 * @param {string} folder 
 * @returns {Promise<string>} Secure URL of uploaded image
 */
const uploadFilePath = async (filePath, folder = 'annalakshmi/products') => {
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
    resource_type: 'image',
  });
  return result.secure_url;
};

module.exports = {
  cloudinary,
  uploadBuffer,
  uploadBase64,
  uploadFilePath,
};
