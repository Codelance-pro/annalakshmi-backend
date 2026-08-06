const mongoose = require('mongoose');

const productSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    category: { type: String, required: true },
    tags: [{ type: String }],
    images: [{ type: String }],
    isNew: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    isCustomizableOnly: { type: Boolean, default: false },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
    suppressReservedKeysWarning: true,
  }
);

const transformFn = (doc, ret) => {
  ret.id = ret.id || (ret._id ? ret._id.toString() : undefined);
  delete ret._id;
  delete ret.__v;
  return ret;
};

productSchema.set('toJSON', { transform: transformFn });
productSchema.set('toObject', { transform: transformFn });

module.exports = mongoose.model('Product', productSchema);
