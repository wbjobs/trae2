import request, { uploadService } from '@/utils/request';
import { ApiResponse } from '@/types';

export const CHUNK_SIZE = 5 * 1024 * 1024;

export const uploadModel = (file: File, onProgress?: (percent: number) => void): Promise<ApiResponse> => {
  const formData = new FormData();
  formData.append('model', file);
  return uploadService.post('/storage/upload', formData, {
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        onProgress(percent);
      }
    }
  });
};

export const initChunkUpload = (fileName: string, fileSize: number, fileType: string): Promise<ApiResponse<{
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number[];
}>> => {
  return uploadService.post('/storage/chunk/init', { fileName, fileSize, fileType });
};

export const uploadChunk = (
  uploadId: string,
  chunkIndex: number,
  chunk: Blob,
  onProgress?: (percent: number) => void
): Promise<ApiResponse<{
  uploadId: string;
  chunkIndex: number;
  uploadedChunks: number[];
  progress: number;
}>> => {
  const formData = new FormData();
  formData.append('uploadId', uploadId);
  formData.append('chunkIndex', chunkIndex.toString());
  formData.append('chunk', chunk);
  return uploadService.post('/storage/chunk/upload', formData, {
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
        onProgress(percent);
      }
    }
  });
};

export const getChunkUploadStatus = (uploadId: string): Promise<ApiResponse<{
  uploadId: string;
  totalChunks: number;
  uploadedChunks: number[];
  progress: number;
  status: string;
}>> => {
  return request.get(`/storage/chunk/status/${uploadId}`);
};

export const completeChunkUpload = (uploadId: string): Promise<ApiResponse<{
  fileId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  url: string;
  uploadDate: Date;
}>> => {
  return uploadService.post(`/storage/chunk/complete/${uploadId}`);
};

export const cancelChunkUpload = (uploadId: string): Promise<ApiResponse> => {
  return request.delete(`/storage/chunk/cancel/${uploadId}`);
};

export const uploadModelChunked = async (
  file: File,
  onProgress?: (percent: number, current: number, total: number) => void
): Promise<any> => {
  const CHUNK_SIZE = 5 * 1024 * 1024;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

  const initRes = await initChunkUpload(file.name, file.size, file.type);
  const { uploadId } = initRes.data;

  const concurrency = 3;
  const uploadedChunks = new Set<number>();
  let failedAttempts = 0;
  const maxFailures = 3;

  const uploadChunkWithRetry = async (index: number): Promise<void> => {
    if (uploadedChunks.has(index)) return;

    const start = index * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, file.size);
    const chunk = file.slice(start, end);

    try {
      await uploadChunk(uploadId, index, chunk);
      uploadedChunks.add(index);
      
      if (onProgress) {
        const progress = Math.round((uploadedChunks.size / totalChunks) * 100);
        onProgress(progress, uploadedChunks.size, totalChunks);
      }
    } catch (error) {
      if (failedAttempts < maxFailures) {
        failedAttempts++;
        await new Promise(resolve => setTimeout(resolve, 1000));
        return uploadChunkWithRetry(index);
      }
      throw error;
    }
  };

  const uploadQueue: number[] = [];
  for (let i = 0; i < totalChunks; i++) {
    uploadQueue.push(i);
  }

  const workers = Array(concurrency).fill(null).map(async () => {
    while (uploadQueue.length > 0) {
      const index = uploadQueue.shift()!;
      await uploadChunkWithRetry(index);
    }
  });

  await Promise.all(workers);

  const completeRes = await completeChunkUpload(uploadId);
  return completeRes.data;
};

export const getModelUrl = (fileId: string): Promise<ApiResponse<{ fileId: string; url: string }>> => {
  return request.get(`/storage/url/${fileId}`);
};

export const deleteModel = (fileId: string): Promise<ApiResponse> => {
  return request.delete(`/storage/${fileId}`);
};
