import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export enum SpecimenStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  ARCHIVED = 'archived'
}

export interface ISpecimenAttributes {
  id?: number;
  specimenNo: string;
  name: string;
  scientificName: string;
  commonName?: string;
  category: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
  description?: string;
  habitat?: string;
  distribution?: string;
  collectionDate?: Date;
  collectionLocation?: string;
  collectionLatitude?: number;
  collectionLongitude?: number;
  collector?: string;
  depth?: string;
  waterTemperature?: string;
  salinity?: string;
  size?: string;
  weight?: string;
  color?: string;
  features?: string;
  status: SpecimenStatus;
  storageLocation?: string;
  remarks?: string;
  tags?: string;
  createdBy?: number;
  verifiedBy?: number;
  verifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

class Specimen extends Model<ISpecimenAttributes> implements ISpecimenAttributes {
  public id!: number;
  public specimenNo!: string;
  public name!: string;
  public scientificName!: string;
  public commonName?: string;
  public category!: string;
  public phylum?: string;
  public class?: string;
  public order?: string;
  public family?: string;
  public genus?: string;
  public species?: string;
  public description?: string;
  public habitat?: string;
  public distribution?: string;
  public collectionDate?: Date;
  public collectionLocation?: string;
  public collectionLatitude?: number;
  public collectionLongitude?: number;
  public collector?: string;
  public depth?: string;
  public waterTemperature?: string;
  public salinity?: string;
  public size?: string;
  public weight?: string;
  public color?: string;
  public features?: string;
  public status!: SpecimenStatus;
  public storageLocation?: string;
  public remarks?: string;
  public tags?: string;
  public createdBy?: number;
  public verifiedBy?: number;
  public verifiedAt?: Date;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Specimen.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    specimenNo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    scientificName: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    commonName: {
      type: DataTypes.STRING(100)
    },
    category: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    phylum: {
      type: DataTypes.STRING(50)
    },
    class: {
      type: DataTypes.STRING(50)
    },
    order: {
      type: DataTypes.STRING(50)
    },
    family: {
      type: DataTypes.STRING(50)
    },
    genus: {
      type: DataTypes.STRING(50)
    },
    species: {
      type: DataTypes.STRING(50)
    },
    description: {
      type: DataTypes.TEXT
    },
    habitat: {
      type: DataTypes.TEXT
    },
    distribution: {
      type: DataTypes.TEXT
    },
    collectionDate: {
      type: DataTypes.DATE
    },
    collectionLocation: {
      type: DataTypes.STRING(200)
    },
    collectionLatitude: {
      type: DataTypes.DECIMAL(10, 6)
    },
    collectionLongitude: {
      type: DataTypes.DECIMAL(10, 6)
    },
    collector: {
      type: DataTypes.STRING(100)
    },
    depth: {
      type: DataTypes.STRING(50)
    },
    waterTemperature: {
      type: DataTypes.STRING(20)
    },
    salinity: {
      type: DataTypes.STRING(20)
    },
    size: {
      type: DataTypes.STRING(50)
    },
    weight: {
      type: DataTypes.STRING(50)
    },
    color: {
      type: DataTypes.STRING(50)
    },
    features: {
      type: DataTypes.TEXT
    },
    status: {
      type: DataTypes.ENUM(...Object.values(SpecimenStatus)),
      allowNull: false,
      defaultValue: SpecimenStatus.PENDING
    },
    storageLocation: {
      type: DataTypes.STRING(100)
    },
    remarks: {
      type: DataTypes.TEXT
    },
    tags: {
      type: DataTypes.STRING(255)
    },
    createdBy: {
      type: DataTypes.INTEGER
    },
    verifiedBy: {
      type: DataTypes.INTEGER
    },
    verifiedAt: {
      type: DataTypes.DATE
    }
  },
  {
    sequelize,
    tableName: 'specimens',
    indexes: [
      { fields: ['specimenNo'] },
      { fields: ['name'] },
      { fields: ['category'] },
      { fields: ['status'] }
    ]
  }
);

export default Specimen;
