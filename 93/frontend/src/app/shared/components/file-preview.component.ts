import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { BehaviorSubject, Subscription } from 'rxjs';

export type PreviewType = 'image' | 'pdf' | 'text' | 'office' | 'video' | 'audio' | 'code' | 'archive' | 'unknown';

interface PreviewConfig {
  type: PreviewType;
  supported: boolean;
  mimeType: string;
  extension: string;
  viewerUrl?: string;
}

@Component({
  selector: 'app-file-preview',
  standalone: true,
  imports: [CommonModule, HttpClientModule],
  template: `
    <div class="file-preview-container">
      <div class="preview-header">
        <div class="file-info">
          <span class="file-icon">{{ getFileIcon(config().extension) }}</span>
          <div class="file-meta">
            <span class="file-name">{{ fileName }}</span>
            <span class="file-type">{{ config().mimeType }}</span>
          </div>
        </div>
        <div class="preview-actions">
          <button class="action-btn" *ngIf="config().supported" (click)="toggleFullscreen()" title="全屏">
            ⛶
          </button>
          <button class="action-btn" (click)="onDownload()" title="下载">
            ⬇
          </button>
          <button class="action-btn close" (click)="onClose()" title="关闭">
            ✕
          </button>
        </div>
      </div>

      <div class="preview-content" [class.fullscreen]="isFullscreen">
        <ng-container [ngSwitch]="config().type">
          <ng-container *ngSwitchCase="'image'">
            <div class="image-container">
              <img [src]="fileUrl" [alt]="fileName" (error)="handleImageError($event)" />
            </div>
          </ng-container>

          <ng-container *ngSwitchCase="'pdf'">
            <iframe
              class="pdf-viewer"
              [src]="sanitizedUrl"
              type="application/pdf"
              (error)="handlePdfError()"
            ></iframe>
            <div *ngIf="pdfLoadError" class="error-container">
              <div class="error-icon">📄</div>
              <p>PDF预览加载失败，可能由于跨域限制</p>
              <button class="btn btn-primary" (click)="onDownload()">下载文件</button>
            </div>
          </ng-container>

          <ng-container *ngSwitchCase="'text'">
            <div class="text-container">
              <pre *ngIf="textContent">{{ textContent }}</pre>
              <div *ngIf="textLoading" class="loading-spinner">加载中...</div>
              <div *ngIf="textError" class="error-container">
                <div class="error-icon">⚠️</div>
                <p>文本内容加载失败</p>
                <button class="btn btn-primary" (click)="onDownload()">下载文件</button>
              </div>
            </div>
          </ng-container>

          <ng-container *ngSwitchCase="'office'">
            <div class="office-container">
              <iframe
                class="office-viewer"
                [src]="getOfficeViewerUrl()"
                (error)="handleOfficeError()"
              ></iframe>
              <div *ngIf="officeLoadError" class="error-container">
                <div class="error-icon">📊</div>
                <p>Office文档在线预览需要公网可访问的链接</p>
                <p class="hint">支持格式：doc, docx, xls, xlsx, ppt, pptx</p>
                <button class="btn btn-primary" (click)="onDownload()">下载文件</button>
              </div>
            </div>
          </ng-container>

          <ng-container *ngSwitchCase="'video'">
            <video class="video-player" controls [src]="fileUrl">
              您的浏览器不支持视频播放
            </video>
          </ng-container>

          <ng-container *ngSwitchCase="'audio'">
            <div class="audio-container">
              <div class="audio-icon">🎵</div>
              <audio class="audio-player" controls [src]="fileUrl">
                您的浏览器不支持音频播放
              </audio>
            </div>
          </ng-container>

          <ng-container *ngSwitchCase="'code'">
            <div class="code-container">
              <pre *ngIf="textContent" class="code-block"><code>{{ textContent }}</code></pre>
              <div *ngIf="textLoading" class="loading-spinner">加载中...</div>
            </div>
          </ng-container>

          <ng-container *ngSwitchCase="'archive'">
            <div class="archive-container">
              <div class="archive-icon">📦</div>
              <h3>压缩包文件</h3>
              <p>{{ fileName }}</p>
              <p class="hint">压缩包文件不支持在线预览</p>
              <button class="btn btn-primary" (click)="onDownload()">下载文件</button>
            </div>
          </ng-container>

          <ng-container *ngSwitchDefault>
            <div class="unknown-container">
              <div class="unknown-icon">{{ getFileIcon(config().extension) }}</div>
              <h3>{{ fileName }}</h3>
              <p>文件类型：{{ config().mimeType }}</p>
              <p class="hint">该文件类型暂不支持在线预览</p>
              <button class="btn btn-primary" (click)="onDownload()">下载文件</button>
            </div>
          </ng-container>
        </ng-container>
      </div>
    </div>
  `,
  styles: [`
    .file-preview-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #fff;
      border-radius: 8px;
      overflow: hidden;
    }
    .preview-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }
    .file-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .file-icon {
      font-size: 32px;
    }
    .file-meta {
      display: flex;
      flex-direction: column;
    }
    .file-name {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .file-type {
      font-size: 12px;
      color: #6b7280;
    }
    .preview-actions {
      display: flex;
      gap: 8px;
    }
    .action-btn {
      width: 36px;
      height: 36px;
      border: none;
      background: #e5e7eb;
      border-radius: 6px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    .action-btn:hover {
      background: #d1d5db;
    }
    .action-btn.close:hover {
      background: #fee2e2;
      color: #dc2626;
    }
    .preview-content {
      flex: 1;
      overflow: auto;
      background: #f3f4f6;
      position: relative;
    }
    .preview-content.fullscreen {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 10000;
      background: #000;
    }
    .image-container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100%;
      padding: 20px;
    }
    .image-container img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      border-radius: 4px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    }
    .pdf-viewer {
      width: 100%;
      height: calc(100vh - 200px);
      min-height: 500px;
      border: none;
    }
    .text-container {
      height: 100%;
      padding: 20px;
    }
    .text-container pre {
      background: #1f2937;
      color: #f9fafb;
      padding: 20px;
      border-radius: 6px;
      overflow: auto;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 13px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
      max-height: calc(100vh - 240px);
    }
    .office-container {
      height: 100%;
    }
    .office-viewer {
      width: 100%;
      height: calc(100vh - 200px);
      min-height: 500px;
      border: none;
    }
    .video-player {
      width: 100%;
      max-height: calc(100vh - 200px);
      background: #000;
    }
    .audio-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 40px;
      gap: 20px;
    }
    .audio-icon {
      font-size: 64px;
    }
    .audio-player {
      width: 100%;
      max-width: 500px;
    }
    .code-container {
      height: 100%;
      padding: 20px;
    }
    .code-block {
      background: #0d1117;
      color: #c9d1d9;
      padding: 20px;
      border-radius: 6px;
      overflow: auto;
      font-family: 'Consolas', 'Monaco', monospace;
      font-size: 13px;
      line-height: 1.6;
      max-height: calc(100vh - 240px);
    }
    .archive-container, .unknown-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 40px;
      gap: 12px;
      text-align: center;
    }
    .archive-icon, .unknown-icon {
      font-size: 64px;
      margin-bottom: 10px;
    }
    .error-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 40px;
      gap: 12px;
      text-align: center;
    }
    .error-icon {
      font-size: 48px;
      margin-bottom: 10px;
    }
    .hint {
      color: #6b7280;
      font-size: 14px;
    }
    .loading-spinner {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100px;
      color: #6b7280;
    }
    .btn {
      padding: 10px 24px;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: #3b82f6;
      color: #fff;
    }
    .btn-primary:hover {
      background: #2563eb;
    }
  `]
})
export class FilePreviewComponent implements OnInit, OnDestroy {
  @Input() fileName!: string;
  @Input() fileUrl!: string;
  @Input() mimeType: string = '';

  @Output() close = new EventEmitter<void>();
  @Output() download = new EventEmitter<void>();

  private configSubject = new BehaviorSubject<PreviewConfig>({
    type: 'unknown',
    supported: false,
    mimeType: '',
    extension: ''
  });
  config = this.configSubject.asObservable();

  sanitizedUrl: string = '';
  textContent: string = '';
  textLoading = false;
  textError = false;
  pdfLoadError = false;
  officeLoadError = false;
  isFullscreen = false;

  private textSubscription?: Subscription;

  private readonly imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.ico', '.tiff'];
  private readonly pdfExtensions = ['.pdf'];
  private readonly textExtensions = ['.txt', '.md', '.log', '.csv', '.xml', '.json', '.yaml', '.yml', '.ini', '.conf'];
  private readonly officeExtensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp'];
  private readonly videoExtensions = ['.mp4', '.webm', '.ogg', '.avi', '.mov', '.mkv'];
  private readonly audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.aac', '.m4a'];
  private readonly codeExtensions = ['.js', '.ts', '.html', '.css', '.scss', '.java', '.py', '.cpp', '.c', '.h', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.vue', '.tsx', '.jsx'];
  private readonly archiveExtensions = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'];

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    const extension = this.getFileExtension(this.fileName).toLowerCase();
    const type = this.detectFileType(extension, this.mimeType);
    const supported = this.isSupported(type);

    this.configSubject.next({
      type,
      supported,
      mimeType: this.mimeType || this.getMimeType(extension),
      extension
    });

    if (type === 'text' || type === 'code') {
      this.loadTextContent();
    }

    if (type === 'pdf') {
      this.sanitizedUrl = this.fileUrl;
    }
  }

  ngOnDestroy(): void {
    this.textSubscription?.unsubscribe();
    this.exitFullscreen();
  }

  private getFileExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    return lastDot >= 0 ? filename.substring(lastDot) : '';
  }

  private detectFileType(extension: string, mimeType: string): PreviewType {
    if (this.imageExtensions.includes(extension) || mimeType.startsWith('image/')) return 'image';
    if (this.pdfExtensions.includes(extension) || mimeType === 'application/pdf') return 'pdf';
    if (this.officeExtensions.includes(extension)) return 'office';
    if (this.videoExtensions.includes(extension) || mimeType.startsWith('video/')) return 'video';
    if (this.audioExtensions.includes(extension) || mimeType.startsWith('audio/')) return 'audio';
    if (this.codeExtensions.includes(extension)) return 'code';
    if (this.archiveExtensions.includes(extension)) return 'archive';
    if (this.textExtensions.includes(extension) || mimeType.startsWith('text/')) return 'text';
    return 'unknown';
  }

  private isSupported(type: PreviewType): boolean {
    return type !== 'unknown' && type !== 'archive';
  }

  private getMimeType(extension: string): string {
    const mimeMap: Record<string, string> = {
      '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
      '.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain', '.csv': 'text/csv', '.json': 'application/json', '.xml': 'application/xml',
      '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.zip': 'application/zip'
    };
    return mimeMap[extension] || 'application/octet-stream';
  }

  getFileIcon(extension: string): string {
    const iconMap: Record<string, string> = {
      '.pdf': '📄', '.doc': '📝', '.docx': '📝', '.xls': '📊', '.xlsx': '📊',
      '.ppt': '📽️', '.pptx': '📽️', '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️',
      '.gif': '🖼️', '.zip': '📦', '.rar': '📦', '.7z': '📦', '.mp4': '🎬',
      '.mp3': '🎵', '.txt': '📃', '.csv': '📋', '.json': '📋', '.xml': '📋'
    };
    return iconMap[extension.toLowerCase()] || '📁';
  }

  getOfficeViewerUrl(): string {
    const encodedUrl = encodeURIComponent(this.fileUrl);
    return `https://view.officeapps.live.com/op/view.aspx?src=${encodedUrl}`;
  }

  private loadTextContent(): void {
    this.textLoading = true;
    this.textError = false;
    this.textSubscription = this.http.get(this.fileUrl, { responseType: 'text' }).subscribe({
      next: (content) => {
        this.textContent = content;
        this.textLoading = false;
      },
      error: () => {
        this.textError = true;
        this.textLoading = false;
      }
    });
  }

  handleImageError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgZmlsbD0iI2UzZTdlYiIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOWNhM2EiIGZvbnQtc2l6ZT0iMTQiPuWbvueJh+WKoOi9veWksei0peWKoOegtVw8vdGV4dD48L3N2Zz4=';
  }

  handlePdfError(): void {
    this.pdfLoadError = true;
  }

  handleOfficeError(): void {
    this.officeLoadError = true;
  }

  toggleFullscreen(): void {
    this.isFullscreen = !this.isFullscreen;
  }

  private exitFullscreen(): void {
    this.isFullscreen = false;
  }

  onDownload(): void {
    this.download.emit();
    const link = document.createElement('a');
    link.href = this.fileUrl;
    link.download = this.fileName;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  onClose(): void {
    this.close.emit();
  }
}
