const mongoose = require('mongoose');

const inquirySchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String },
    message: { type: String, required: true },
    productId: { type: String },
  },
  {
    timestamps: true,
  }
);

const transformFn = (doc, ret) => {
  ret.id = ret.id || (ret._id ? ret._id.toString() : undefined);
  delete ret._id;
  delete ret.__v;
  return ret;
};

inquirySchema.set('toJSON', { transform: transformFn });
inquirySchema.set('toObject', { transform: transformFn });

module.exports = mongoose.model('Inquiry', inquirySchema);
