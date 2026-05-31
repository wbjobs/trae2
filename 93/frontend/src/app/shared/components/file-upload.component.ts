import { Component, Input, Output, EventEmitter, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface FileItem {
  file: File;
  name: string;
  size: number;
  progress: number;
  status: 'pending' | 'uploading' | 'success' | 'error';
}

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="upload-container">
      <div 
        class="upload-area"
        [class.dragover]="isDragging"
        (drop)="handleDrop($event)"
        (dragover)="handleDragOver($event)"
        (dragleave)="handleDragLeave($event)"
        (click)="triggerFileInput()"
      >
        <input 
          #fileInput 
          type="file" 
          hidden 
          [multiple]="multiple"
          [accept]="accept"
          (change)="handleFileSelect($event)"
        />
        <div class="upload-icon">📁</div>
        <p class="upload-text">点击或拖拽文件到此处上传</p>
        <p class="upload-hint">支持 {{ accept || '所有文件' }}，单个文件不超过 {{ maxSize }}MB</p>
      </div>

      <div class="file-list" *ngIf="fileList.length > 0">
        <div class="file-item" *ngFor="let item of fileList; let i = index">
          <div class="file-info">
            <span class="file-icon">📄</span>
            <div class="file-details">
              <span class="file-name">{{ item.name }}</span>
              <span class="file-size">{{ formatSize(item.size) }}</span>
            </div>
          </div>
          <div class="file-status">
            <div class="progress-bar" *ngIf="item.status === 'uploading'">
              <div class="progress-fill" [style.width]="item.progress + '%'"></div>
            </div>
            <span class="status-text" [class.success]="item.status === 'success'" [class.error]="item.status === 'error'">
              {{ getStatusText(item.status) }}
            </span>
          </div>
          <button class="remove-btn" (click)="removeFile(i)">×</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .upload-container {
      width: 100%;
    }
    .upload-area {
      border: 2px dashed #d1d5db;
      border-radius: 8px;
      padding: 32px;
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
    .file-list {
      margin-top: 16px;
    }
    .file-item {
      display: flex;
      align-items: center;
      padding: 12px;
      background: #f9fafb;
      border-radius: 6px;
      margin-bottom: 8px;
      gap: 12px;
    }
    .file-info {
      display: flex;
      align-items: center;
      flex: 1;
      min-width: 0;
    }
    .file-icon {
      font-size: 24px;
      margin-right: 12px;
    }
    .file-details {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .file-name {
      font-size: 14px;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .file-size {
      font-size: 12px;
      color: #6b7280;
    }
    .file-status {
      flex: 1;
    }
    .progress-bar {
      height: 6px;
      background: #e5e7eb;
      border-radius: 3px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: #3b82f6;
      transition: width 0.3s;
    }
    .status-text {
      font-size: 12px;
    }
    .status-text.success {
      color: #10b981;
    }
    .status-text.error {
      color: #ef4444;
    }
    .remove-btn {
      width: 24px;
      height: 24px;
      border: none;
      background: #e5e7eb;
      border-radius: 50%;
      cursor: pointer;
      font-size: 16px;
      line-height: 1;
      color: #6b7280;
    }
    .remove-btn:hover {
      background: #d1d5db;
      color: #374151;
    }
  `]
})
export class FileUploadComponent {
  @Input() multiple = false;
  @Input() accept = '';
  @Input() maxSize = 10;

  @Output() fileChange = new EventEmitter<File[]>();
  @Output() uploadProgress = new EventEmitter<{ file: File; progress: number }>();

  fileList: FileItem[] = [];
  isDragging = false;

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

  triggerFileInput(): void {
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
    if (files) {
      this.addFiles(Array.from(files));
    }
  }

  handleFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files) {
      this.addFiles(Array.from(files));
    }
    input.value = '';
  }

  addFiles(files: File[]): void {
    const validFiles = files.filter(file => {
      const maxSizeBytes = this.maxSize * 1024 * 1024;
      return file.size <= maxSizeBytes;
    });

    if (!this.multiple && validFiles.length > 0) {
      this.fileList = [];
    }

    validFiles.forEach(file => {
      const fileItem: FileItem = {
        file,
        name: file.name,
        size: file.size,
        progress: 0,
        status: 'pending'
      };
      this.fileList.push(fileItem);
      this.simulateUpload(fileItem);
    });

    this.fileChange.emit(this.fileList.map(item => item.file));
  }

  simulateUpload(fileItem: FileItem): void {
    fileItem.status = 'uploading';
    
    const interval = setInterval(() => {
      fileItem.progress += Math.random() * 20;
      if (fileItem.progress >= 100) {
        fileItem.progress = 100;
        fileItem.status = 'success';
        clearInterval(interval);
      }
      this.uploadProgress.emit({ file: fileItem.file, progress: fileItem.progress });
    }, 200);
  }

  removeFile(index: number): void {
    this.fileList.splice(index, 1);
    this.fileChange.emit(this.fileList.map(item => item.file));
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  getStatusText(status: string): string {
    const map: Record<string, string> = {
      pending: '等待上传',
      uploading: '上传中...',
      success: '上传成功',
      error: '上传失败'
    };
    return map[status] || status;
  }
}
