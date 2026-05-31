const mongoose = require('mongoose');

const GeometrySchema = new mongoose.Schema({
  id: { type: String, required: true },
  type: { type: String, enum: ['box', 'sphere', 'cylinder'], required: true },
  position: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    z: { type: Number, default: 0 }
  },
  rotation: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0 },
    z: { type: Number, default: 0 }
  },
  scale: {
    x: { type: Number, default: 1 },
    y: { type: Number, default: 1 },
    z: { type: Number, default: 1 }
  },
  color: { type: String, default: '#00ff00' },
  createdAt: { type: Number, required: true },
  updatedAt: { type: Number, required: true }
});

const RoomSchema = new mongoose.Schema({
  roomId: { type: String, required: true, unique: true },
  geometries: [GeometrySchema],
  version: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

RoomSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Room', RoomSchema);
