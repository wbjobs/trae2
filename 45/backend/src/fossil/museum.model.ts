import mongoose, { Document, Schema } from 'mongoose';

export interface IMuseum extends Document {
  name: string;
  code: string;
  address?: string;
  contact?: string;
  phone?: string;
  email?: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const museumSchema: Schema<IMuseum> = new Schema({
  name: {
    type: String,
    required: [true, '场馆名称不能为空'],
    trim: true
  },
  code: {
    type: String,
    required: [true, '场馆编码不能为空'],
    unique: true,
    trim: true,
    uppercase: true
  },
  address: String,
  contact: String,
  phone: String,
  email: String,
  description: String,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

museumSchema.index({ code: 1 });
museumSchema.index({ name: 'text' });

export default mongoose.model<IMuseum>('Museum', museumSchema);
