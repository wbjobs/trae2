import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export enum TraceType {
  COLLECTION = 'collection',
  TRANSPORT = 'transport',
  PROCESSING = 'processing',
  STORAGE = 'storage',
  EXHIBITION = 'exhibition',
  RESEARCH = 'research',
  RESTORATION = 'restoration',
  OTHER = 'other'
}

export interface ITraceabilityAttributes {
  id?: number;
  specimenId: number;
  traceType: TraceType;
  title: string;
  description?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  operator?: string;
  operatorId?: number;
  traceDate: Date;
  temperature?: string;
  humidity?: string;
  remarks?: string;
  attachments?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

class Traceability extends Model<ITraceabilityAttributes> implements ITraceabilityAttributes {
  public id!: number;
  public specimenId!: number;
  public traceType!: TraceType;
  public title!: string;
  public description?: string;
  public location?: string;
  public latitude?: number;
  public longitude?: number;
  public operator?: string;
  public operatorId?: number;
  public traceDate!: Date;
  public temperature?: string;
  public humidity?: string;
  public remarks?: string;
  public attachments?: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Traceability.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    specimenId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'specimens',
        key: 'id'
      }
    },
    traceType: {
      type: DataTypes.ENUM(...Object.values(TraceType)),
      allowNull: false
    },
    title: {
      type: DataTypes.STRING(200),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT
    },
    location: {
      type: DataTypes.STRING(200)
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 6)
    },
    longitude: {
      type: DataTypes.DECIMAL(10, 6)
    },
    operator: {
      type: DataTypes.STRING(100)
    },
    operatorId: {
      type: DataTypes.INTEGER
    },
    traceDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    temperature: {
      type: DataTypes.STRING(20)
    },
    humidity: {
      type: DataTypes.STRING(20)
    },
    remarks: {
      type: DataTypes.TEXT
    },
    attachments: {
      type: DataTypes.TEXT
    }
  },
  {
    sequelize,
    tableName: 'traceability',
    indexes: [
      { fields: ['specimenId'] },
      { fields: ['traceType'] },
      { fields: ['traceDate'] }
    ]
  }
);

export default Traceability;
