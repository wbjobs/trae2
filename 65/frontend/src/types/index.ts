export enum UserRole {
  ADMIN = 'admin',
  CURATOR = 'curator',
  RESEARCHER = 'researcher',
  GUEST = 'guest'
}

export interface User {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: UserRole;
  avatar?: string;
  phone?: string;
  department?: string;
  isActive: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum SpecimenStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  ARCHIVED = 'archived'
}

export interface Specimen {
  id: number;
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
  createdAt: Date;
  updatedAt: Date;
  images?: SpecimenImage[];
  traceabilityRecords?: TraceabilityRecord[];
}

export enum ImageType {
  MAIN = 'main',
  DETAIL = 'detail',
  MICROSCOPE = 'microscope',
  HABITAT = 'habitat',
  OTHER = 'other'
}

export interface SpecimenImage {
  id: number;
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
  createdAt: Date;
  updatedAt: Date;
  specimen?: {
    id: number;
    specimenNo: string;
    name: string;
    scientificName: string;
  };
}

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

export interface TraceabilityRecord {
  id: number;
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
  createdAt: Date;
  updatedAt: Date;
  specimen?: {
    id: number;
    specimenNo: string;
    name: string;
    scientificName: string;
  };
}

export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
  message: string;
}
