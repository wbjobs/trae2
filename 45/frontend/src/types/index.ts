export type UserRole = 'admin' | 'curator' | 'researcher' | 'viewer';

export interface User {
  _id: string;
  username: string;
  email: string;
  role: UserRole;
  realName: string;
  phone?: string;
  department?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
  lastLogin?: string;
}

export type FossilCategory = 'dinosaur' | 'paleobotany' | 'invertebrate' | 'vertebrate' | 'trace' | 'other';
export type FossilStatus = 'stored' | 'exhibiting' | 'researching' | 'restoring' | 'transferred';

export interface ModelFile {
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  url: string;
  uploadDate: string;
}

export interface FossilDimensions {
  length?: number;
  width?: number;
  height?: number;
  weight?: number;
  unit: string;
}

export interface Fossil {
  _id: string;
  specimenNo: string;
  name: string;
  scientificName?: string;
  category: FossilCategory;
  geologicalPeriod?: string;
  geologicalAge?: string;
  discoveryLocation?: string;
  discoveryDate?: string;
  discoverer?: string;
  description: string;
  features?: string;
  preservationStatus?: string;
  dimensions?: FossilDimensions;
  images?: string[];
  modelFiles: ModelFile[];
  status: FossilStatus;
  currentLocation: string;
  storageCondition?: string;
  acquisitionMethod?: string;
  acquisitionDate?: string;
  tags?: string[];
  remarks?: string;
  createdBy: string | User;
  updatedBy: string | User;
  createdAt: string;
  updatedAt: string;
}

export type TraceType = 'create' | 'update' | 'status_change' | 'location_change' | 'loan' | 'return' | 'exhibit' | 'research' | 'restore' | 'transfer' | 'delete';

export interface Trace {
  _id: string;
  fossilId: string;
  specimenNo: string;
  type: TraceType;
  title: string;
  description?: string;
  operator: string | User;
  operatorName: string;
  fromLocation?: string;
  toLocation?: string;
  fromStatus?: string;
  toStatus?: string;
  timestamp: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface ApiResponse<T = any> {
  status: string;
  message?: string;
  data?: T;
  token?: string;
  results?: number;
  total?: number;
  totalPages?: number;
  currentPage?: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}
