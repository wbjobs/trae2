import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from './User.model';
import { Specimen } from './Specimen.model';

export enum SharingLevel {
  PRIVATE = 'private',
  INTERNAL = 'internal',
  PUBLIC = 'public'
}

export interface SharingAttributes {
  id: number;
  specimenId: number;
  sharedBy: number;
  sharedWith?: number;
  sharingLevel: SharingLevel;
  expiresAt?: Date;
  permissions: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SharingCreationAttributes extends Optional<SharingAttributes, 'id' | 'createdAt' | 'updatedAt'> {}

export class Sharing extends Model<SharingAttributes, SharingCreationAttributes> implements SharingAttributes {
  public id!: number;
  public specimenId!: number;
  public sharedBy!: number;
  public sharedWith?: number;
  public sharingLevel!: SharingLevel;
  public expiresAt?: Date;
  public permissions!: string;
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public readonly specimen?: Specimen;
  public readonly sharedByUser?: User;
  public readonly sharedWithUser?: User;
}

Sharing.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    specimenId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'specimens',
        key: 'id'
      }
    },
    sharedBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    sharedWith: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },
    sharingLevel: {
      type: DataTypes.ENUM(...Object.values(SharingLevel)),
      allowNull: false,
      defaultValue: SharingLevel.PRIVATE
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    permissions: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'read'
    }
  },
  {
    sequelize,
    modelName: 'Sharing',
    tableName: 'sharings',
    timestamps: true
  }
);

Sharing.belongsTo(Specimen, { foreignKey: 'specimenId', as: 'specimen' });
Sharing.belongsTo(User, { foreignKey: 'sharedBy', as: 'sharedByUser' });
Sharing.belongsTo(User, { foreignKey: 'sharedWith', as: 'sharedWithUser' });
