import mongoose, { Document, Schema } from 'mongoose';

export type SharingStatus = 'pending' | 'active' | 'expired' | 'revoked';
export type SharingPermission = 'view' | 'download' | 'edit';

export interface ISharing extends Document {
  fossilId: Schema.Types.ObjectId;
  specimenNo: string;
  fromMuseumId: Schema.Types.ObjectId;
  toMuseumId: Schema.Types.ObjectId;
  toMuseumCode?: string;
  toEmail?: string;
  shareCode?: string;
  permission: SharingPermission;
  status: SharingStatus;
  expiresAt?: Date;
  createdAt: Date;
  createdBy: Schema.Types.ObjectId;
  accessedAt?: Date;
  accessCount: number;
  password?: string;
  description?: string;
}

const sharingSchema: Schema<ISharing> = new Schema({
  fossilId: {
    type: Schema.Types.ObjectId,
    ref: 'Fossil',
    required: true,
    index: true
  },
  specimenNo: {
    type: String,
    required: true,
    index: true
  },
  fromMuseumId: {
    type: Schema.Types.ObjectId,
    ref: 'Museum',
    required: true
  },
  toMuseumId: {
    type: Schema.Types.ObjectId,
    ref: 'Museum'
  },
  toMuseumCode: String,
  toEmail: String,
  shareCode: {
    type: String,
    unique: true,
    sparse: true
  },
  permission: {
    type: String,
    enum: ['view', 'download', 'edit'],
    default: 'view',
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'expired', 'revoked'],
    default: 'active',
    index: true
  },
  expiresAt: Date,
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  accessedAt: Date,
  accessCount: {
    type: Number,
    default: 0
  },
  password: String,
  description: String
}, {
  timestamps: true
});

sharingSchema.index({ fossilId: 1, status: 1 });
sharingSchema.index({ fromMuseumId: 1, createdAt: -1 });
sharingSchema.index({ toMuseumId: 1, status: 1 });
sharingSchema.index({ shareCode: 1, status: 1 });

sharingSchema.pre('save', function(next) {
  if (!this.shareCode) {
    this.shareCode = `SHARE-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }
  next();
});

export default mongoose.model<ISharing>('Sharing', sharingSchema);
