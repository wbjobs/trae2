import { DataTypes, Model } from 'sequelize';
import { sequelize } from '../config/database';

export enum ImageType {
  MAIN = 'main',
  DETAIL = 'detail',
  MICROSCOPE = 'microscope',
  HABITAT = 'habitat',
  OTHER = 'other'
}

export interface ISpecimenImageAttributes {
  id?: number;
  specimenId: number;
  fileName: string;
  originalName: string;
  fileUrl: string;
  thumbnailUrl?: string;
  fileSize: number;
  fileType: string;
  imageType: ImageType;
  width?: number;
  height?: number;
  resolution?: string;
  description?: string;
  tags?: string;
  aiAnalysis?: string;
  colorPalette?: string;
  dominantColors?: string;
  uploadedBy?: number;
  isPrimary: boolean;
  sortOrder: number;
  createdAt?: Date;
  updatedAt?: Date;
}

class SpecimenImage extends Model<ISpecimenImageAttributes> implements ISpecimenImageAttributes {
  public id!: number;
  public specimenId!: number;
  public fileName!: string;
  public originalName!: string;
  public fileUrl!: string;
  public thumbnailUrl?: string;
  public fileSize!: number;
  public fileType!: string;
  public imageType!: ImageType;
  public width?: number;
  public height?: number;
  public resolution?: string;
  public description?: string;
  public tags?: string;
  public aiAnalysis?: string;
  public colorPalette?: string;
  public dominantColors?: string;
  public uploadedBy?: number;
  public isPrimary!: boolean;
  public sortOrder!: number;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

SpecimenImage.init(
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
    fileName: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    originalName: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    fileUrl: {
      type: DataTypes.STRING(500),
      allowNull: false
    },
    thumbnailUrl: {
      type: DataTypes.STRING(500)
    },
    fileSize: {
      type: DataTypes.BIGINT,
      allowNull: false
    },
    fileType: {
      type: DataTypes.STRING(50),
      allowNull: false
    },
    imageType: {
      type: DataTypes.ENUM(...Object.values(ImageType)),
      allowNull: false,
      defaultValue: ImageType.DETAIL
    },
    width: {
      type: DataTypes.INTEGER
    },
    height: {
      type: DataTypes.INTEGER
    },
    resolution: {
      type: DataTypes.STRING(20)
    },
    description: {
      type: DataTypes.TEXT
    },
    tags: {
      type: DataTypes.TEXT,
      comment: '图片标签，逗号分隔'
    },
    aiAnalysis: {
      type: DataTypes.TEXT,
      comment: 'AI分析结果，JSON格式'
    },
    colorPalette: {
      type: DataTypes.STRING(255),
      comment: '调色板，逗号分隔的HEX颜色值'
    },
    dominantColors: {
      type: DataTypes.STRING(255),
      comment: '主色，逗号分隔的HEX颜色值'
    },
    uploadedBy: {
      type: DataTypes.INTEGER
    },
    isPrimary: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    }
  },
  {
    sequelize,
    tableName: 'specimen_images',
    indexes: [
      { fields: ['specimenId'] },
      { fields: ['isPrimary'] },
      { fields: ['imageType'] },
      { fields: ['tags'], type: 'FULLTEXT' }
    ]
  }
);

export default SpecimenImage;
