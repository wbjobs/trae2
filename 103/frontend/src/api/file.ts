import request from '@/utils/request'

export function getFileList(params?: any) {
  return request({
    url: '/files/',
    method: 'get',
    params,
  })
}

export function getFileDetail(id: string) {
  return request({
    url: `/files/${id}/`,
    method: 'get',
  })
}

export function getUploadUrl(data: any) {
  return request({
    url: '/files/',
    method: 'post',
    data,
  })
}

export function getDownloadUrl(id: string) {
  return request({
    url: `/files/${id}/download/`,
    method: 'get',
  })
}

export function getPreviewUrl(id: string) {
  return request({
    url: `/files/${id}/preview/`,
    method: 'get',
  })
}

export function deleteFile(id: string) {
  return request({
    url: `/files/${id}/`,
    method: 'delete',
  })
}

export function uploadFile(uploadUrl: string, file: File, onProgress?: (percent: number) => void) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ etag: xhr.getResponseHeader('ETag') })
      } else {
        reject(new Error('Upload failed'))
      }
    }
    xhr.onerror = () => reject(new Error('Upload failed'))
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      }
    }
    xhr.send(file)
  })
}

export function confirmFileUpload(data: any) {
  return request({
    url: '/files/confirm_upload/',
    method: 'post',
    data,
  })
}

export function getFileVersions(id: string) {
  return request({
    url: `/files/${id}/versions/`,
    method: 'get',
  })
}

export function getFileVersionDetail(fileId: string, versionId: string) {
  return request({
    url: `/files/${fileId}/versions/${versionId}/`,
    method: 'get',
  })
}

export function createFileVersion(id: string, data: any) {
  return request({
    url: `/files/${id}/new_version/`,
    method: 'post',
    data,
  })
}

export function downloadFileVersion(fileId: string, versionId: string) {
  return request({
    url: `/files/${fileId}/download/`,
    method: 'get',
    params: { version: versionId },
  })
}
