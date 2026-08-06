const mongoose = require('mongoose');

const designSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    bagId: { type: String },
    name: { type: String },
    mobile: { type: String },
    artworkUrl: { type: String },
    previewUrl: { type: String },
    position: { type: Object },
    size: { type: Object },
    rotation: { type: Number },
    layers: { type: Array },
    bagColor: { type: String },
    timestamp: { type: String },
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

designSchema.set('toJSON', { transform: transformFn });
designSchema.set('toObject', { transform: transformFn });

module.exports = mongoose.model('Design', designSchema);
