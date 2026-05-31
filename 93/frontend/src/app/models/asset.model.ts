export enum AssetType {
  PAPER = 'PAPER',
  REPORT = 'REPORT',
  PATENT = 'PATENT',
  DATA = 'DATA',
  OTHER = 'OTHER'
}

export enum AssetStatus {
  DRAFT = 'DRAFT',
  ARCHIVED = 'ARCHIVED',
  APPROVING = 'APPROVING',
  BORROWED = 'BORROWED',
  REVOKED = 'REVOKED'
}

export enum ClassificationLevel {
  PUBLIC = 'PUBLIC',
  INTERNAL = 'INTERNAL',
  CONFIDENTIAL = 'CONFIDENTIAL',
  SECRET = 'SECRET'
}

export interface Asset {
  id: string;
  assetCode: string;
  title: string;
  assetType: AssetType;
  abstractText: string;
  keywords: string;
  authors: string;
  department: string;
  projectId: string;
  status: AssetStatus;
  classificationLevel: ClassificationLevel;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
  files: AssetFile[];
}

export interface AssetFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  ossKey: string;
  downloadUrl: string;
  uploadedByName: string;
  uploadedAt: Date;
}

export interface AssetQuery {
  keyword?: string;
  assetType?: string;
  status?: string;
  classificationLevel?: string;
  department?: string;
  startDate?: string;
  endDate?: string;
  pageNum?: number;
  pageSize?: number;
}
