import { Component, Input, Output, EventEmitter, HostListener, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpClientModule, HttpEventType, HttpRequest, HttpResponse } from '@angular/common/http';
import { Subscription } from 'rxjs';

interface ChunkItem {
  chunkNumber: number;
  file: Blob;
  md5: string;
  uploaded: boolean;
  uploading: boolean;
  progress: number;
}

interface UploadTask {
  uploadId: string;
  file: File;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkSize: number;
  totalChunks: number;
  chunks: ChunkItem[];
  uploadedChunks: number;
  progress: number;
  status: 'pending' | 'uploading' | 'paused' | 'completed' | 'error';
  ossKey?: string;
  url?: string;
}

interface UploadTaskDTO {
  uploadId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number;
  uploadedSize: number;
  status: string;
  ossKey?: string;
  createdAt: string;
  completedAt?: string;
  uploadedChunkNumbers: number[];
}

interface UploadResponse {
  uploadId: string;
  chunkNumber: number;
  uploaded: boolean;
  shouldMerge: boolean;
}

@Component({
  selector: 'app-chunk-upload',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  template: `
    <div class="chunk-upload-container">
      <div
        class="upload-area"
        [class.dragover]="isDragging"
        [class.disabled]="isUploading"
        (drop)="handleDrop($event)"
        (dragover)="handleDragOver($event)"
        (dragleave)="handleDragLeave($event)"
        (click)="triggerFileInput()"
      >
        <input
          #fileInput
          type="file"
          hidden
          [accept]="accept"
          (change)="handleFileSelect($event)"
        />
        <div class="upload-icon">📁</div>
        <p class="upload-text">点击或拖拽大文件到此处上传</p>
        <p class="upload-hint">支持分片上传、断点续传、秒传，单文件最大支持 {{ maxSize }}GB</p>
      </div>

      <div class="task-list" *ngIf="tasks.length > 0">
        <div class="task-item" *ngFor="let task of tasks; let i = index">
          <div class="task-header">
            <div class="file-info">
              <span class="file-icon">📄</span>
              <div class="file-details">
                <span class="file-name">{{ task.fileName }}</span>
                <span class="file-size">{{ formatSize(task.fileSize) }} · {{ task.totalChunks }}个分片</span>
              </div>
            </div>
            <div class="task-actions">
              <button
                *ngIf="task.status === 'uploading'"
                class="action-btn pause-btn"
                (click)="pauseUpload(task)"
                title="暂停"
              >
                ⏸
              </button>
              <button
                *ngIf="task.status === 'paused'"
                class="action-btn resume-btn"
                (click)="resumeUpload(task)"
                title="继续"
              >
                ▶
              </button>
              <button
                *ngIf="task.status !== 'completed' && task.status !== 'error'"
                class="action-btn cancel-btn"
                (click)="cancelUpload(task)"
                title="取消"
              >
                ✕
              </button>
            </div>
          </div>

          <div class="task-progress">
            <div class="progress-bar">
              <div class="progress-fill" [style.width]="task.progress + '%'"></div>
            </div>
            <div class="progress-info">
              <span class="progress-text">
                {{ getStatusText(task.status) }} · {{ task.uploadedChunks }}/{{ task.totalChunks }} 分片
              </span>
              <span class="progress-percent">{{ task.progress.toFixed(1) }}%</span>
            </div>
          </div>

          <div class="chunk-grid" *ngIf="task.totalChunks <= 100">
            <div
              class="chunk-item"
              *ngFor="let chunk of task.chunks"
              [class.uploaded]="chunk.uploaded"
              [class.uploading]="chunk.uploading"
              [title]="'分片 ' + chunk.chunkNumber + ': ' + (chunk.uploaded ? '已上传' : chunk.uploading ? '上传中' : '等待上传')"
            >
              {{ chunk.chunkNumber }}
            </div>
          </div>

          <div class="task-url" *ngIf="task.status === 'completed' && task.url">
            <span class="url-label">上传完成：</span>
            <a [href]="task.url" target="_blank" class="url-link">{{ task.fileName }}</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .chunk-upload-container {
      width: 100%;
    }
    .upload-area {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 40px;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s;
      background: #fafafa;
    }
    .upload-area:hover, .upload-area.dragover {
      border-color: #3b82f6;
      background: #eff6ff;
    }
    .upload-area.dragover {
      border-style: solid;
    }
    .upload-area.disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .upload-icon {
      font-size: 48px;
      margin-bottom: 12px;
    }
    .upload-text {
      margin: 0 0 8px 0;
      font-size: 16px;
      color: #374151;
      font-weight: 500;
    }
    .upload-hint {
      margin: 0;
      font-size: 14px;
      color: #6b7280;
    }
    .task-list {
      margin-top: 20px;
    }
    .task-item {
      background: #fff;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 12px;
    }
    .task-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .file-info {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
      flex: 1;
    }
    .file-icon {
      font-size: 28px;
    }
    .file-details {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .file-name {
      font-size: 14px;
      font-weight: 500;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-size {
      font-size: 12px;
      color: #6b7280;
    }
    .task-actions {
      display: flex;
      gap: 8px;
    }
    .action-btn {
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .pause-btn {
      background: #fef3c7;
      color: #d97706;
    }
    .pause-btn:hover {
      background: #fde68a;
    }
    .resume-btn {
      background: #d1fae5;
      color: #059669;
    }
    .resume-btn:hover {
      background: #a7f3d0;
    }
    .cancel-btn {
      background: #fee2e2;
      color: #dc2626;
    }
    .cancel-btn:hover {
      background: #fecaca;
    }
    .task-progress {
      margin-bottom: 12px;
    }
    .progress-bar {
      height: 8px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #3b82f6, #60a5fa);
      transition: width 0.3s;
    }
    .progress-info {
      display: flex;
      justify-content: space-between;
      margin-top: 6px;
    }
    .progress-text {
      font-size: 12px;
      color: #6b7280;
    }
    .progress-percent {
      font-size: 12px;
      font-weight: 500;
      color: #374151;
    }
    .chunk-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }
    .chunk-item {
      width: 24px;
      height: 24px;
      border: 1px solid #d1d5db;
      border-radius: 4px;
      font-size: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #f9fafb;
      color: #9ca3af;
    }
    .chunk-item.uploading {
      background: #dbeafe;
      border-color: #3b82f6;
      color: #1d4ed8;
      animation: pulse 1s infinite;
    }
    .chunk-item.uploaded {
      background: #d1fae5;
      border-color: #10b981;
      color: #059669;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    .task-url {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid #e5e7eb;
      font-size: 13px;
    }
    .url-label {
      color: #6b7280;
    }
    .url-link {
      color: #3b82f6;
      text-decoration: none;
      margin-left: 4px;
    }
    .url-link:hover {
      text-decoration: underline;
    }
  `]
})
export class ChunkUploadComponent implements OnDestroy {
  @Input() accept = '';
  @Input() maxSize = 10;
  @Input() chunkSize = 5 * 1024 * 1024;
  @Input() concurrency = 3;

  @Output() uploadComplete = new EventEmitter<{ ossKey: string; url: string; fileName: string; fileSize: number }>();
  @Output() uploadError = new EventEmitter<string>();

  tasks: UploadTask[] = [];
  isDragging = false;
  private baseUrl = 'http://localhost:8080/api';
  private subscriptions = new Map<string, Subscription[]>();
  private pendingChunks = new Map<string, ChunkItem[]>();

  @HostListener('dragover', ['$event'])
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  @HostListener('drop', ['$event'])
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  constructor(private http: HttpClient) {}

  ngOnDestroy(): void {
    this.subscriptions.forEach((subs) => {
      subs.forEach((sub) => sub.unsubscribe());
    });
    this.subscriptions.clear();
  }

  get isUploading(): boolean {
    return this.tasks.some((t) => t.status === 'uploading');
  }

  triggerFileInput(): void {
    if (this.isUploading) return;
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    input?.click();
  }

  handleDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  handleDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
  }

  handleDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.addFile(files[0]);
    }
  }

  handleFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      this.addFile(files[0]);
    }
    input.value = '';
  }

  async addFile(file: File): Promise<void> {
    const maxSizeBytes = this.maxSize * 1024 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      this.uploadError.emit(`文件大小超过限制，最大支持 ${this.maxSize}GB`);
      return;
    }

    const totalChunks = Math.ceil(file.size / this.chunkSize);
    const fileType = file.name.substring(file.name.lastIndexOf('.') + 1);

    const task: UploadTask = {
      uploadId: '',
      file,
      fileName: file.name,
      fileSize: file.size,
      fileType,
      chunkSize: this.chunkSize,
      totalChunks,
      chunks: [],
      uploadedChunks: 0,
      progress: 0,
      status: 'pending',
    };

    this.tasks.push(task);

    try {
      await this.initUpload(task);
    } catch (error: any) {
      task.status = 'error';
      this.uploadError.emit(error.message || '上传初始化失败');
    }
  }

  private async initUpload(task: UploadTask): Promise<void> {
    const fileType = task.file.name.substring(task.file.name.lastIndexOf('.') + 1);
    const initData = {
      fileName: task.fileName,
      fileSize: task.fileSize,
      fileType,
      mimeType: task.file.type,
      chunkSize: this.chunkSize,
    };

    const response = await this.http
      .post<{ code: number; message: string; data: UploadTaskDTO }>(`${this.baseUrl}/upload/init`, initData)
      .toPromise();

    if (response?.code === 200 && response.data) {
      task.uploadId = response.data.uploadId;
      task.status = 'uploading';

      const uploadedChunks = response.data.uploadedChunkNumbers || [];

      for (let i = 1; i <= task.totalChunks; i++) {
        const start = (i - 1) * this.chunkSize;
        const end = Math.min(start + this.chunkSize, task.fileSize);
        const chunkBlob = task.file.slice(start, end);

        task.chunks.push({
          chunkNumber: i,
          file: chunkBlob,
          md5: '',
          uploaded: uploadedChunks.includes(i),
          uploading: false,
          progress: uploadedChunks.includes(i) ? 100 : 0,
        });
      }

      task.uploadedChunks = uploadedChunks.length;
      task.progress = (task.uploadedChunks / task.totalChunks) * 100;

      this.saveTaskToStorage(task);
      this.startUpload(task);
    } else {
      throw new Error(response?.message || '初始化失败');
    }
  }

  private async startUpload(task: UploadTask): Promise<void> {
    const pendingChunks = task.chunks.filter((c) => !c.uploaded && !c.uploading);
    this.pendingChunks.set(task.uploadId, pendingChunks);

    const taskSubs: Subscription[] = [];
    this.subscriptions.set(task.uploadId, taskSubs);

    for (let i = 0; i < this.concurrency; i++) {
      this.uploadNextChunk(task);
    }
  }

  private async uploadNextChunk(task: UploadTask): Promise<void> {
    const pending = this.pendingChunks.get(task.uploadId);
    if (!pending || pending.length === 0 || task.status !== 'uploading') {
      return;
    }

    const chunk = pending.shift();
    if (!chunk) return;

    chunk.uploading = true;

    try {
      const md5 = await this.calculateMD5(chunk.file);
      chunk.md5 = md5;

      const checkResponse = await this.http
        .get<{ code: number; message: string; data: boolean }>(`${this.baseUrl}/upload/check`, {
          params: {
            uploadId: task.uploadId,
            chunkNumber: chunk.chunkNumber,
            chunkSize: chunk.file.size,
            md5,
          },
        })
        .toPromise();

      if (checkResponse?.code === 200 && checkResponse.data) {
        chunk.uploaded = true;
        chunk.uploading = false;
        chunk.progress = 100;
        task.uploadedChunks++;
        task.progress = (task.uploadedChunks / task.totalChunks) * 100;
        this.saveTaskToStorage(task);
        this.checkUploadComplete(task);
        this.uploadNextChunk(task);
        return;
      }

      const formData = new FormData();
      formData.append('file', chunk.file);
      formData.append('uploadId', task.uploadId);
      formData.append('chunkNumber', chunk.chunkNumber.toString());
      formData.append('chunkSize', chunk.file.size.toString());
      formData.append('md5', md5);

      const req = new HttpRequest('POST', `${this.baseUrl}/upload/chunk`, formData, {
        reportProgress: true,
      });

      const sub = this.http.request(req).subscribe(
        (event) => {
          if (event.type === HttpEventType.UploadProgress) {
            const total = event.total || chunk.file.size;
            chunk.progress = Math.round((event.loaded / total) * 100);
          } else if (event instanceof HttpResponse) {
            const body = event.body as any;
            if (body?.code === 200) {
              chunk.uploaded = true;
              chunk.uploading = false;
              chunk.progress = 100;
              task.uploadedChunks++;
              task.progress = (task.uploadedChunks / task.totalChunks) * 100;
              this.saveTaskToStorage(task);

              const uploadResponse = body.data as UploadResponse;
              if (uploadResponse.shouldMerge) {
                this.mergeChunks(task);
              } else {
                this.uploadNextChunk(task);
              }
            } else {
              throw new Error(body?.message || '上传失败');
            }
          }
        },
        (error) => {
          chunk.uploading = false;
          chunk.progress = 0;
          task.status = 'error';
          this.uploadError.emit(error.message || '上传失败');
        }
      );

      const taskSubs = this.subscriptions.get(task.uploadId);
      if (taskSubs) {
        taskSubs.push(sub);
      }
    } catch (error: any) {
      chunk.uploading = false;
      task.status = 'error';
      this.uploadError.emit(error.message || '上传失败');
    }
  }

  private async checkUploadComplete(task: UploadTask): Promise<void> {
    if (task.uploadedChunks >= task.totalChunks && task.status === 'uploading') {
      await this.mergeChunks(task);
    }
  }

  private async mergeChunks(task: UploadTask): Promise<void> {
    try {
      const response = await this.http
        .post<{ code: number; message: string; data: { ossKey: string; url: string } }>(
          `${this.baseUrl}/upload/merge`,
          null,
          { params: { uploadId: task.uploadId } }
        )
        .toPromise();

      if (response?.code === 200 && response.data) {
        task.status = 'completed';
        task.ossKey = response.data.ossKey;
        task.url = response.data.url;
        task.progress = 100;

        this.removeTaskFromStorage(task.uploadId);

        this.uploadComplete.emit({
          ossKey: response.data.ossKey,
          url: response.data.url,
          fileName: task.fileName,
          fileSize: task.fileSize,
        });
      } else {
        throw new Error(response?.message || '合并失败');
      }
    } catch (error: any) {
      task.status = 'error';
      this.uploadError.emit(error.message || '合并失败');
    }
  }

  pauseUpload(task: UploadTask): void {
    if (task.status !== 'uploading') return;

    task.status = 'paused';
    const subs = this.subscriptions.get(task.uploadId);
    if (subs) {
      subs.forEach((sub) => sub.unsubscribe());
      subs.length = 0;
    }

    this.http
      .post(`${this.baseUrl}/upload/pause/${task.uploadId}`, null)
      .subscribe(() => {
        this.saveTaskToStorage(task);
      });
  }

  async resumeUpload(task: UploadTask): Promise<void> {
    if (task.status !== 'paused') return;

    try {
      const response = await this.http
        .post<{ code: number; message: string; data: UploadTaskDTO }>(
          `${this.baseUrl}/upload/resume/${task.uploadId}`,
          null
        )
        .toPromise();

      if (response?.code === 200 && response.data) {
        const uploadedChunks = response.data.uploadedChunkNumbers || [];
        task.chunks.forEach((chunk) => {
          if (uploadedChunks.includes(chunk.chunkNumber)) {
            chunk.uploaded = true;
            chunk.progress = 100;
          }
        });
        task.uploadedChunks = uploadedChunks.length;
        task.progress = (task.uploadedChunks / task.totalChunks) * 100;
        task.status = 'uploading';

        this.saveTaskToStorage(task);
        this.startUpload(task);
      }
    } catch (error: any) {
      task.status = 'error';
      this.uploadError.emit(error.message || '恢复上传失败');
    }
  }

  cancelUpload(task: UploadTask): void {
    const subs = this.subscriptions.get(task.uploadId);
    if (subs) {
      subs.forEach((sub) => sub.unsubscribe());
      this.subscriptions.delete(task.uploadId);
    }

    this.pendingChunks.delete(task.uploadId);

    this.http
      .delete(`${this.baseUrl}/upload/${task.uploadId}`)
      .subscribe(() => {
        this.removeTaskFromStorage(task.uploadId);
        const index = this.tasks.indexOf(task);
        if (index > -1) {
          this.tasks.splice(index, 1);
        }
      });
  }

  private async calculateMD5(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const hash = await crypto.subtle.digest('SHA-256', arrayBuffer);
        const hashArray = Array.from(new Uint8Array(hash));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
        resolve(hashHex.substring(0, 32));
      };
      reader.readAsArrayBuffer(blob);
    });
  }

  private saveTaskToStorage(task: UploadTask): void {
    const storageKey = `upload_task_${task.uploadId}`;
    const data = {
      uploadId: task.uploadId,
      fileName: task.fileName,
      fileSize: task.fileSize,
      fileType: task.fileType,
      chunkSize: task.chunkSize,
      totalChunks: task.totalChunks,
      uploadedChunks: task.uploadedChunks,
      progress: task.progress,
      status: task.status,
      uploadedChunkNumbers: task.chunks.filter((c) => c.uploaded).map((c) => c.chunkNumber),
      timestamp: Date.now(),
    };
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  private removeTaskFromStorage(uploadId: string): void {
    const storageKey = `upload_task_${uploadId}`;
    localStorage.removeItem(storageKey);
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  }

  getStatusText(status: string): string {
    const map: Record<string, string> = {
      pending: '等待上传',
      uploading: '上传中',
      paused: '已暂停',
      completed: '已完成',
      error: '上传失败',
    };
    return map[status] || status;
  }
}
