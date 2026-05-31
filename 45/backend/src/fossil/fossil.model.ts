import mongoose, { Document, Schema } from 'mongoose';

export type FossilStatus = 'stored' | 'exhibiting' | 'researching' | 'restoring' | 'transferred';
export type FossilCategory = 'dinosaur' | 'paleobotany' | 'invertebrate' | 'vertebrate' | 'trace' | 'other';

export interface IModelFile {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  url: string;
  uploadDate: Date;
}

export interface IFossil extends Document {
  specimenNo: string;
  name: string;
  scientificName?: string;
  category: FossilCategory;
  geologicalPeriod?: string;
  geologicalAge?: string;
  discoveryLocation?: string;
  discoveryDate?: Date;
  discoverer?: string;
  description: string;
  features?: string;
  preservationStatus?: string;
  dimensions?: {
    length?: number;
    width?: number;
    height?: number;
    weight?: number;
    unit: string;
  };
  images?: string[];
  modelFiles: IModelFile[];
  status: FossilStatus;
  currentLocation: string;
  storageCondition?: string;
  acquisitionMethod?: string;
  acquisitionDate?: Date;
  tags?: string[];
  remarks?: string;
  museumId?: Schema.Types.ObjectId;
  isShared: boolean;
  shareLevel?: 'public' | 'internal' | 'private';
  searchVector?: string;
  viewCount: number;
  createdBy: Schema.Types.ObjectId;
  updatedBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const fossilSchema: Schema<IFossil> = new Schema({
  specimenNo: {
    type: String,
    required: [true, '标本编号不能为空'],
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: [true, '标本名称不能为空'],
    trim: true
  },
  scientificName: String,
  category: {
    type: String,
    enum: ['dinosaur', 'paleobotany', 'invertebrate', 'vertebrate', 'trace', 'other'],
    required: [true, '标本分类不能为空']
  },
  geologicalPeriod: String,
  geologicalAge: String,
  discoveryLocation: String,
  discoveryDate: Date,
  discoverer: String,
  description: {
    type: String,
    required: [true, '标本描述不能为空']
  },
  features: String,
  preservationStatus: String,
  dimensions: {
    length: Number,
    width: Number,
    height: Number,
    weight: Number,
    unit: {
      type: String,
      default: 'cm'
    }
  },
  images: [String],
  modelFiles: [{
    fileId: String,
    fileName: String,
    fileSize: Number,
    fileType: String,
    url: String,
    uploadDate: Date
  }],
  status: {
    type: String,
    enum: ['stored', 'exhibiting', 'researching', 'restoring', 'transferred'],
    default: 'stored'
  },
  currentLocation: {
    type: String,
    required: [true, '当前位置不能为空']
  },
  storageCondition: String,
  acquisitionMethod: String,
  acquisitionDate: Date,
  tags: [String],
  remarks: String,
  museumId: {
    type: Schema.Types.ObjectId,
    ref: 'Museum',
    index: true
  },
  isShared: {
    type: Boolean,
    default: false,
    index: true
  },
  shareLevel: {
    type: String,
    enum: ['public', 'internal', 'private'],
    default: 'private'
  },
  searchVector: {
    type: String,
    select: false
  },
  viewCount: {
    type: Number,
    default: 0,
    index: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

fossilSchema.index({ name: 'text', description: 'text', scientificName: 'text', specimenNo: 'text', tags: 'text', features: 'text', geologicalPeriod: 'text' }, {
  weights: {
    name: 10,
    scientificName: 8,
    specimenNo: 6,
    tags: 5,
    description: 3,
    features: 2,
    geologicalPeriod: 2
  },
  default_language: 'zh'
});
fossilSchema.index({ category: 1, status: 1 });
fossilSchema.index({ createdAt: -1 });
fossilSchema.index({ museumId: 1, category: 1 });
fossilSchema.index({ isShared: 1, shareLevel: 1 });

fossilSchema.pre('save', function(next) {
  const parts = [
    this.name,
    this.scientificName,
    this.specimenNo,
    this.description,
    this.geologicalPeriod,
    this.geologicalAge,
    this.discoveryLocation,
    (this.tags || []).join(' ')
  ].filter(Boolean);
  this.searchVector = parts.join(' ');
  next();
});

export default mongoose.model<IFossil>('Fossil', fossilSchema);
