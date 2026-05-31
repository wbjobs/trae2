import mongoose, { Document, Schema } from 'mongoose';

export type TraceType = 'create' | 'update' | 'status_change' | 'location_change' | 'loan' | 'return' | 'exhibit' | 'research' | 'restore' | 'transfer' | 'delete';

export interface ITrace extends Document {
  fossilId: Schema.Types.ObjectId;
  specimenNo: string;
  type: TraceType;
  title: string;
  description?: string;
  operator: Schema.Types.ObjectId;
  operatorName: string;
  fromLocation?: string;
  toLocation?: string;
  fromStatus?: string;
  toStatus?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
  createdAt: Date;
}

const traceSchema: Schema<ITrace> = new Schema({
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
  type: {
    type: String,
    enum: ['create', 'update', 'status_change', 'location_change', 'loan', 'return', 'exhibit', 'research', 'restore', 'transfer', 'delete'],
    required: true
  },
  title: {
    type: String,
    required: true
  },
  description: String,
  operator: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  operatorName: {
    type: String,
    required: true
  },
  fromLocation: String,
  toLocation: String,
  fromStatus: String,
  toStatus: String,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

traceSchema.index({ fossilId: 1, timestamp: -1 });
traceSchema.index({ type: 1, timestamp: -1 });
traceSchema.index({ operator: 1, timestamp: -1 });

export default mongoose.model<ITrace>('Trace', traceSchema);
