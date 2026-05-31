import api, { uploadApi } from './api';
import { Specimen, SpecimenImage, TraceabilityRecord } from '../types';

export const specimenService = {
  async getSpecimens(params: {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    status?: string;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<{
    specimens: Specimen[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const response = await api.get('/specimens', { params });
    return response.data;
  },

  async getSpecimen(id: number): Promise<{ specimen: Specimen }> {
    const response = await api.get(`/specimens/${id}`);
    return response.data;
  },

  async createSpecimen(data: Partial<Specimen>): Promise<{ specimen: Specimen; message: string }> {
    const response = await api.post('/specimens', data);
    return response.data;
  },

  async updateSpecimen(id: number, data: Partial<Specimen>): Promise<{ specimen: Specimen; message: string }> {
    const response = await api.put(`/specimens/${id}`, data);
    return response.data;
  },

  async deleteSpecimen(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/specimens/${id}`);
    return response.data;
  },

  async verifySpecimen(id: number): Promise<{ specimen: Specimen; message: string }> {
    const response = await api.patch(`/specimens/${id}/verify`);
    return response.data;
  },

  async getCategories(): Promise<{ categories: string[] }> {
    const response = await api.get('/specimens/categories');
    return response.data;
  },

  async getStats(): Promise<{
    total: number;
    pending: number;
    verified: number;
    archived: number;
    categoryStats: any[];
  }> {
    const response = await api.get('/specimens/stats');
    return response.data;
  }
};

export const imageService = {
  async getImagesBySpecimenId(specimenId: number): Promise<{ images: SpecimenImage[] }> {
    const response = await api.get(`/images/specimen/${specimenId}`);
    return response.data;
  },

  async getImage(id: number): Promise<{ image: SpecimenImage }> {
    const response = await api.get(`/images/${id}`);
    return response.data;
  },

  async uploadImages(
    specimenId: number,
    files: File[],
    imageType?: string,
    onProgress?: (progress: number) => void
  ): Promise<{ images: SpecimenImage[]; message: string }> {
    const formData = new FormData();
    formData.append('specimenId', String(specimenId));
    if (imageType) {
      formData.append('imageType', imageType);
    }
    files.forEach((file) => {
      formData.append('images', file);
    });

    const response = await uploadApi.post('/images', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      }
    });
    return response.data;
  },

  async updateImage(
    id: number,
    data: Partial<SpecimenImage>
  ): Promise<{ image: SpecimenImage; message: string }> {
    const response = await api.put(`/images/${id}`, data);
    return response.data;
  },

  async setPrimaryImage(id: number): Promise<{ image: SpecimenImage; message: string }> {
    const response = await api.patch(`/images/${id}/primary`);
    return response.data;
  },

  async deleteImage(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/images/${id}`);
    return response.data;
  }
};

export const traceabilityService = {
  async getTraceRecords(params: {
    page?: number;
    limit?: number;
    specimenId?: number;
    traceType?: string;
    startDate?: string;
    endDate?: string;
  } = {}): Promise<{
    records: TraceabilityRecord[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const response = await api.get('/traceability', { params });
    return response.data;
  },

  async getTraceRecordsBySpecimenId(specimenId: number): Promise<{ records: TraceabilityRecord[] }> {
    const response = await api.get(`/traceability/specimen/${specimenId}`);
    return response.data;
  },

  async getTraceMapData(specimenId: number): Promise<{ mapData: any[] }> {
    const response = await api.get(`/traceability/specimen/${specimenId}/map`);
    return response.data;
  },

  async getTraceRecord(id: number): Promise<{ record: TraceabilityRecord }> {
    const response = await api.get(`/traceability/${id}`);
    return response.data;
  },

  async createTraceRecord(
    data: Partial<TraceabilityRecord>
  ): Promise<{ record: TraceabilityRecord; message: string }> {
    const response = await api.post('/traceability', data);
    return response.data;
  },

  async updateTraceRecord(
    id: number,
    data: Partial<TraceabilityRecord>
  ): Promise<{ record: TraceabilityRecord; message: string }> {
    const response = await api.put(`/traceability/${id}`, data);
    return response.data;
  },

  async deleteTraceRecord(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/traceability/${id}`);
    return response.data;
  },

  async getTraceTypes(): Promise<{
    traceTypes: { value: string; label: string }[];
  }> {
    const response = await api.get('/traceability/types');
    return response.data;
  }
};

export const userService = {
  async getUsers(params: {
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
  } = {}): Promise<{
    users: User[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const response = await api.get('/users', { params });
    return response.data;
  },

  async getUser(id: number): Promise<{ user: User }> {
    const response = await api.get(`/users/${id}`);
    return response.data;
  },

  async createUser(
    data: Partial<User> & { password: string }
  ): Promise<{ user: User; message: string }> {
    const response = await api.post('/users', data);
    return response.data;
  },

  async updateUser(
    id: number,
    data: Partial<User>
  ): Promise<{ user: User; message: string }> {
    const response = await api.put(`/users/${id}`, data);
    return response.data;
  },

  async deleteUser(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/users/${id}`);
    return response.data;
  },

  async updateUserRole(id: number, role: string): Promise<{ user: User; message: string }> {
    const response = await api.patch(`/users/${id}/role`, { role });
    return response.data;
  }
};

export const searchService = {
  async searchImages(params: {
    keyword?: string;
    tags?: string;
    imageType?: string;
    specimenId?: number;
    color?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: string;
  } = {}): Promise<{
    images: SpecimenImage[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const response = await api.get('/search/images', { params });
    return response.data;
  },

  async searchSpecimens(params: {
    keyword?: string;
    category?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<{
    specimens: Specimen[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const response = await api.get('/search/specimens', { params });
    return response.data;
  },

  async getSearchSuggestions(keyword: string, type: string = 'all'): Promise<{
    suggestions: any[];
  }> {
    const response = await api.get('/search/suggestions', { params: { keyword, type } });
    return response.data;
  },

  async getTagCloud(): Promise<{
    tagCloud: { name: string; count: number }[];
  }> {
    const response = await api.get('/search/tag-cloud');
    return response.data;
  }
};

export const sharingService = {
  async createSharing(data: {
    specimenId: number;
    sharingLevel: string;
    sharedWith?: number;
    expiresAt?: string;
    permissions?: string;
  }): Promise<{ sharing: any; message: string }> {
    const response = await api.post('/sharing', data);
    return response.data;
  },

  async getSharingsBySpecimen(specimenId: number): Promise<{ sharings: any[] }> {
    const response = await api.get(`/sharing/specimen/${specimenId}`);
    return response.data;
  },

  async getMySharedSpecimens(params: {
    page?: number;
    limit?: number;
  } = {}): Promise<{
    sharings: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const response = await api.get('/sharing/my', { params });
    return response.data;
  },

  async getSharedWithMe(params: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}): Promise<{
    sharings: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const response = await api.get('/sharing/shared-with-me', { params });
    return response.data;
  },

  async updateSharing(id: number, data: any): Promise<{ sharing: any; message: string }> {
    const response = await api.put(`/sharing/${id}`, data);
    return response.data;
  },

  async deleteSharing(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/sharing/${id}`);
    return response.data;
  },

  async checkSharingPermission(specimenId: number): Promise<{
    hasPermission: boolean;
    permission: string | null;
    sharingLevel: string | null;
    reason?: string;
  }> {
    const response = await api.get(`/sharing/check/${specimenId}`);
    return response.data;
  }
};

export const chunkUploadService = {
  async initUpload(fileName: string, fileSize: number, fileType: string, md5?: string): Promise<{
    fileId: string;
    totalChunks: number;
    chunkSize: number;
    uploaded?: boolean;
    image?: SpecimenImage;
  }> {
    const response = await api.post('/upload/chunk/init', { fileName, fileSize, fileType, md5 });
    return response.data;
  },

  async uploadChunk(
    fileId: string,
    chunkIndex: number,
    chunk: Blob,
    onProgress?: (progress: number) => void
  ): Promise<{
    fileId: string;
    chunkIndex: number;
    uploaded: number;
    total: number;
  }> {
    const formData = new FormData();
    formData.append('fileId', fileId);
    formData.append('chunkIndex', String(chunkIndex));
    formData.append('chunk', chunk);

    const response = await uploadApi.post('/upload/chunk', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          onProgress(percentCompleted);
        }
      }
    });
    return response.data;
  },

  async checkChunk(fileId: string, chunkIndex: number): Promise<{ uploaded: boolean }> {
    const response = await api.get('/upload/chunk/check', { params: { fileId, chunkIndex } });
    return response.data;
  },

  async completeUpload(data: {
    fileId: string;
    specimenId: number;
    imageType?: string;
    description?: string;
    tags?: string;
  }): Promise<{ image: SpecimenImage; message: string }> {
    const response = await api.post('/upload/chunk/complete', data);
    return response.data;
  },

  async abortUpload(fileId: string): Promise<{ message: string }> {
    const response = await api.delete(`/upload/chunk/${fileId}`);
    return response.data;
  },

  async updateImageTags(id: number, tags: string, description?: string): Promise<{ image: SpecimenImage; message: string }> {
    const response = await api.patch(`/upload/image/${id}/tags`, { tags, description });
    return response.data;
  }
};

