const mongoose = require('mongoose');

const OperationLogSchema = new mongoose.Schema({
  roomId: { type: String, required: true, index: true },
  opId: { type: String, required: true, unique: true },
  type: {
    type: String,
    enum: ['ADD', 'UPDATE', 'DELETE'],
    required: true
  },
  geometryId: { type: String, required: true },
  userId: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  version: { type: Number, required: true },
  timestamp: { type: Number, required: true }
});

OperationLogSchema.index({ roomId: 1, version: 1 });

module.exports = mongoose.model('OperationLog', OperationLogSchema);
