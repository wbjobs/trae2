import mongoose, { Document, Schema } from 'mongoose';

export type UploadStatus = 'pending' | 'uploading' | 'completed' | 'failed';

export interface IChunkUpload extends Document {
  uploadId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  status: UploadStatus;
  fileType: string;
  uploadedBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
}

const chunkUploadSchema: Schema<IChunkUpload> = new Schema({
  uploadId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  fileName: {
    type: String,
    required: true
  },
  fileSize: {
    type: Number,
    required: true
  },
  chunkSize: {
    type: Number,
    required: true,
    default: 5 * 1024 * 1024
  },
  totalChunks: {
    type: Number,
    required: true
  },
  uploadedChunks: {
    type: [Number],
    default: []
  },
  status: {
    type: String,
    enum: ['pending', 'uploading', 'completed', 'failed'],
    default: 'pending',
    index: true
  },
  fileType: String,
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true
  }
}, {
  timestamps: true
});

chunkUploadSchema.index({ status: 1, createdAt: -1 });
chunkUploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IChunkUpload>('ChunkUpload', chunkUploadSchema);
