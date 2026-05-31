import { User, Department, Specimen, SpecimenFile, Annotation, AnnotationReply, SpecimenVersion, OperationLog, EditLock, Tag, ChunkUploadSession } from '../../../shared/types';

export class DataStore {
  private static instance: DataStore;
  
  users: Map<string, User> = new Map();
  departments: Map<string, Department> = new Map();
  specimens: Map<string, Specimen> = new Map();
  specimenFiles: Map<string, SpecimenFile> = new Map();
  annotations: Map<string, Annotation> = new Map();
  annotationReplies: Map<string, AnnotationReply> = new Map();
  specimenVersions: Map<string, SpecimenVersion> = new Map();
  operationLogs: OperationLog[] = [];
  editLocks: Map<string, EditLock> = new Map();
  tags: Map<string, Tag> = new Map();
  specimenTags: Map<string, string[]> = new Map();
  chunkUploadSessions: Map<string, ChunkUploadSession> = new Map();
  
  specimenNoCounter = 1000;

  private constructor() {
    this.initializeDemoData();
  }

  static getInstance(): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    return DataStore.instance;
  }

  private initializeDemoData() {
    const now = new Date();

    this.departments.set('dept-1', {
      id: 'dept-1',
      name: '植物标本馆',
      parentId: null,
      description: '负责植物标本的采集、鉴定和管理',
      createdAt: now,
      updatedAt: now
    });

    this.departments.set('dept-2', {
      id: 'dept-2',
      name: '动物标本馆',
      parentId: null,
      description: '负责动物标本的采集、鉴定和管理',
      createdAt: now,
      updatedAt: now
    });

    this.users.set('admin', {
      id: 'admin',
      username: 'admin',
      email: 'admin@specimen.com',
      realName: '系统管理员',
      role: 'admin',
      departmentId: null,
      password: 'admin123',
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    this.users.set('user1', {
      id: 'user1',
      username: 'researcher1',
      email: 'researcher1@specimen.com',
      realName: '张科研',
      role: 'researcher',
      departmentId: 'dept-1',
      password: '123456',
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    this.users.set('user2', {
      id: 'user2',
      username: 'curator1',
      email: 'curator1@specimen.com',
      realName: '李馆员',
      role: 'specimen_admin',
      departmentId: 'dept-1',
      password: '123456',
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    const specimen1: Specimen = {
      id: 'spec-1',
      specimenNo: 'SP-2024-0001',
      name: '珙桐',
      scientificName: 'Davidia involucrata Baill.',
      category: '被子植物',
      description: '珙桐科珙桐属植物，国家一级保护植物',
      collector: '王采集',
      collectionDate: new Date('2024-03-15'),
      collectionLocation: '四川省峨眉山',
      latitude: 29.52,
      longitude: 103.33,
      habitat: '海拔1500-2200米的山地森林',
      status: 'published',
      departmentId: 'dept-1',
      createdBy: 'user2',
      updatedBy: 'user2',
      version: 1,
      lastModifiedAt: now,
      createdAt: now,
      updatedAt: now
    };

    const specimen2: Specimen = {
      id: 'spec-2',
      specimenNo: 'SP-2024-0002',
      name: '银杏',
      scientificName: 'Ginkgo biloba L.',
      category: '裸子植物',
      description: '银杏科银杏属，古老的孑遗植物',
      collector: '赵采集',
      collectionDate: new Date('2024-04-20'),
      collectionLocation: '浙江省天目山',
      latitude: 30.32,
      longitude: 119.43,
      habitat: '海拔500-1000米的阔叶林中',
      status: 'published',
      departmentId: 'dept-1',
      createdBy: 'user2',
      updatedBy: 'user2',
      version: 2,
      lastModifiedAt: now,
      createdAt: now,
      updatedAt: now
    };

    this.specimens.set('spec-1', specimen1);
    this.specimens.set('spec-2', specimen2);

    const version1: SpecimenVersion = {
      id: 'ver-1',
      specimenId: 'spec-2',
      version: 1,
      snapshot: { ...specimen2, version: 1, description: '初始记录' },
      changeDescription: '初始版本',
      changedBy: 'user2',
      changes: [],
      changedAt: now
    };

    const version2: SpecimenVersion = {
      id: 'ver-2',
      specimenId: 'spec-2',
      version: 2,
      snapshot: specimen2,
      changeDescription: '更新描述信息',
      changedBy: 'user2',
      changes: [{ field: 'description', oldValue: '初始记录', newValue: specimen2.description }],
      changedAt: now
    };

    this.specimenVersions.set('ver-1', version1);
    this.specimenVersions.set('ver-2', version2);

    const defaultTags: Tag[] = [
      {
        id: 'tag-1',
        name: '国家一级保护',
        color: '#ef4444',
        category: '保护等级',
        description: '国家一级保护动植物',
        createdBy: 'admin',
        createdAt: now
      },
      {
        id: 'tag-2',
        name: '国家二级保护',
        color: '#f97316',
        category: '保护等级',
        description: '国家二级保护动植物',
        createdBy: 'admin',
        createdAt: now
      },
      {
        id: 'tag-3',
        name: '珍稀濒危',
        color: '#8b5cf6',
        category: '物种状态',
        description: '珍稀濒危物种',
        createdBy: 'admin',
        createdAt: now
      },
      {
        id: 'tag-4',
        name: '模式标本',
        color: '#3b82f6',
        category: '标本类型',
        description: '模式标本',
        createdBy: 'admin',
        createdAt: now
      },
      {
        id: 'tag-5',
        name: '待鉴定',
        color: '#6b7280',
        category: '鉴定状态',
        description: '待鉴定标本',
        createdBy: 'admin',
        createdAt: now
      },
      {
        id: 'tag-6',
        name: '重点研究',
        color: '#10b981',
        category: '研究重点',
        description: '重点研究对象',
        createdBy: 'admin',
        createdAt: now
      }
    ];

    defaultTags.forEach(tag => this.tags.set(tag.id, tag));

    this.specimenTags.set('spec-1', ['tag-1', 'tag-3']);
    this.specimenTags.set('spec-2', ['tag-4', 'tag-6']);
  }

  generateSpecimenNo(): string {
    this.specimenNoCounter++;
    return `SP-2024-${this.specimenNoCounter.toString().padStart(4, '0')}`;
  }
}
