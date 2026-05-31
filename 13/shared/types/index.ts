export interface User {
  id: string;
  username: string;
  email: string;
  realName: string;
  role: 'admin' | 'department_head' | 'specimen_admin' | 'researcher' | 'guest';
  departmentId: string | null;
  avatar?: string;
  status: 'active' | 'disabled';
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Department {
  id: string;
  name: string;
  parentId: string | null;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Specimen {
  id: string;
  specimenNo: string;
  name: string;
  scientificName?: string;
  category: string;
  description?: string;
  collector?: string;
  collectionDate?: Date;
  collectionLocation?: string;
  latitude?: number;
  longitude?: number;
  habitat?: string;
  status: 'draft' | 'published' | 'archived';
  departmentId: string;
  createdBy: string;
  updatedBy: string;
  version: number;
  lastModifiedAt: Date;
  tags?: string[];
  customFields?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SpecimenFile {
  id: string;
  specimenId: string;
  name: string;
  originalName: string;
  mimeType: string;
  size: number;
  fileType: 'image' | 'document' | 'video' | 'other';
  storagePath: string;
  url: string;
  thumbnailUrl?: string;
  uploadedBy: string;
  createdAt: Date;
}

export interface Annotation {
  id: string;
  specimenId: string;
  createdBy: string;
  content: string;
  target?: string;
  position?: { x: number; y: number };
  status: 'open' | 'resolved' | 'closed';
  mentions: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface AnnotationReply {
  id: string;
  annotationId: string;
  createdBy: string;
  content: string;
  createdAt: Date;
}

export interface SpecimenVersion {
  id: string;
  specimenId: string;
  version: number;
  snapshot: Partial<Specimen>;
  changeDescription?: string;
  changedBy: string;
  changes: VersionChange[];
  changedAt: Date;
}

export interface VersionChange {
  field: string;
  oldValue: any;
  newValue: any;
}

export interface Tag {
  id: string;
  name: string;
  color: string;
  category: string;
  description?: string;
  createdBy: string;
  createdAt: Date;
}

export interface SpecimenTag {
  specimenId: string;
  tagId: string;
}

export interface OperationLog {
  id: string;
  userId: string | null;
  user?: User;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface ChunkUploadSession {
  sessionId: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
  specimenId: string;
  createdBy: string;
  createdAt: Date;
}

export interface EditLock {
  specimenId: string;
  userId: string;
  userName: string;
  acquiredAt: Date;
  expiresAt: Date;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
