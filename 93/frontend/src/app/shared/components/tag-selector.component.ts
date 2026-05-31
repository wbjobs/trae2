import { Component, Input, Output, EventEmitter, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Tag, TagAutoClassifyResult, Result } from '../../models/common.model';

@Component({
  selector: 'app-tag-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="tag-selector">
      <div class="tag-header">
        <div class="search-box">
          <input
            type="text"
            [(ngModel)]="searchKeyword"
            (input)="filterTags()"
            placeholder="搜索标签..."
            class="search-input"
          />
          <span class="search-icon">🔍</span>
        </div>
        <button
          *ngIf="showAutoClassify && assetId"
          class="auto-classify-btn"
          (click)="handleAutoClassify()"
          [disabled]="isClassifying"
        >
          {{ isClassifying ? '分类中...' : '🤖 智能分类' }}
        </button>
      </div>

      <div class="hot-tags" *ngIf="hotTags.length > 0">
        <div class="section-title">
          <span>🔥 热门标签</span>
        </div>
        <div class="tag-cloud">
          <span
            *ngFor="let tag of hotTags"
            class="tag-item"
            [class.selected]="isSelected(tag)"
            [style.backgroundColor]="getTagColor(tag, isSelected(tag))"
            [style.color]="isSelected(tag) ? '#fff' : getContrastColor(tag.color)"
            (click)="toggleTag(tag)"
            [title]="tag.description"
          >
            {{ tag.tagName }}
            <span class="tag-count">{{ tag.useCount }}</span>
          </span>
        </div>
      </div>

      <div class="all-tags" *ngIf="filteredTags.length > 0">
        <div class="section-title">
          <span>📋 所有标签</span>
        </div>
        <div class="tag-cloud">
          <span
            *ngFor="let tag of filteredTags"
            class="tag-item"
            [class.selected]="isSelected(tag)"
            [style.backgroundColor]="getTagColor(tag, isSelected(tag))"
            [style.color]="isSelected(tag) ? '#fff' : getContrastColor(tag.color)"
            (click)="toggleTag(tag)"
            [title]="tag.description"
          >
            {{ tag.tagName }}
            <span class="tag-count">{{ tag.useCount }}</span>
          </span>
        </div>
      </div>

      <div class="selected-tags" *ngIf="selectedTags.length > 0 || showSelectedEmpty">
        <div class="section-title">
          <span>✅ 已选标签 ({{ selectedTags.length }})</span>
          <button
            *ngIf="selectedTags.length > 0"
            class="clear-btn"
            (click)="clearAll()"
          >
            清空
          </button>
        </div>
        <div class="selected-list">
          <span
            *ngFor="let tag of selectedTags"
            class="selected-tag"
            [style.backgroundColor]="tag.color || '#3b82f6'"
          >
            {{ tag.tagName }}
            <button class="remove-btn" (click)="removeTag(tag)">×</button>
          </span>
          <span *ngIf="selectedTags.length === 0" class="empty-hint">
            点击上方标签进行选择
          </span>
        </div>
      </div>

      <div class="classify-result" *ngIf="classifyResult">
        <div class="result-header">
          <span>🤖 智能分类结果</span>
        </div>
        <div class="result-content">
          <p class="result-reason">{{ classifyResult.classifyReason }}</p>
          <div class="result-keywords" *ngIf="classifyResult.matchedKeywords.length > 0">
            <span class="keywords-label">匹配关键词：</span>
            <span
              *ngFor="let kw of classifyResult.matchedKeywords.slice(0, 10)"
              class="keyword-badge"
            >
              {{ kw }}
            </span>
            <span *ngIf="classifyResult.matchedKeywords.length > 10" class="keyword-more">
              +{{ classifyResult.matchedKeywords.length - 10 }}
            </span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .tag-selector {
      width: 100%;
      background: #fff;
      border-radius: 8px;
      padding: 16px;
      border: 1px solid #e5e7eb;
    }

    .tag-header {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      align-items: center;
    }

    .search-box {
      flex: 1;
      position: relative;
    }

    .search-input {
      width: 100%;
      padding: 10px 40px 10px 16px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    .search-input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .search-icon {
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      color: #9ca3af;
    }

    .auto-classify-btn {
      padding: 10px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .auto-classify-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
    }

    .auto-classify-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .section-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
    }

    .clear-btn {
      padding: 4px 12px;
      background: #f3f4f6;
      color: #6b7280;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }

    .clear-btn:hover {
      background: #e5e7eb;
      color: #374151;
    }

    .tag-cloud {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 16px;
    }

    .tag-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid transparent;
      user-select: none;
    }

    .tag-item:hover {
      transform: translateY(-1px);
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    }

    .tag-item.selected {
      border-color: rgba(255, 255, 255, 0.3);
    }

    .tag-count {
      font-size: 11px;
      opacity: 0.8;
      background: rgba(0, 0, 0, 0.1);
      padding: 1px 6px;
      border-radius: 10px;
    }

    .selected-tags {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
    }

    .selected-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 40px;
    }

    .selected-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px 6px 12px;
      color: white;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 500;
    }

    .remove-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      transition: background 0.2s;
    }

    .remove-btn:hover {
      background: rgba(255, 255, 255, 0.4);
    }

    .empty-hint {
      color: #9ca3af;
      font-size: 13px;
      font-style: italic;
    }

    .classify-result {
      margin-top: 16px;
      padding: 16px;
      background: #f0fdf4;
      border: 1px solid #bbf7d0;
      border-radius: 8px;
    }

    .result-header {
      font-size: 14px;
      font-weight: 600;
      color: #166534;
      margin-bottom: 8px;
    }

    .result-reason {
      margin: 0 0 12px 0;
      font-size: 13px;
      color: #15803d;
      line-height: 1.6;
    }

    .result-keywords {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
    }

    .keywords-label {
      font-size: 12px;
      color: #166534;
      font-weight: 500;
    }

    .keyword-badge {
      padding: 2px 8px;
      background: #dcfce7;
      color: #166534;
      border-radius: 10px;
      font-size: 12px;
    }

    .keyword-more {
      padding: 2px 8px;
      background: #bbf7d0;
      color: #166534;
      border-radius: 10px;
      font-size: 12px;
    }

    .hot-tags, .all-tags {
      margin-bottom: 16px;
    }
  `]
})
export class TagSelectorComponent implements OnInit {
  @Input() selectedTags: Tag[] = [];
  @Input() assetId: string = '';
  @Input() showAutoClassify: boolean = true;
  @Input() showSelectedEmpty: boolean = true;
  @Input() hotTagLimit: number = 15;

  @Output() selectedTagsChange = new EventEmitter<Tag[]>();
  @Output() autoClassifyComplete = new EventEmitter<TagAutoClassifyResult>();

  private http = inject(HttpClient);

  allTags: Tag[] = [];
  filteredTags: Tag[] = [];
  hotTags: Tag[] = [];
  searchKeyword: string = '';
  isClassifying: boolean = false;
  classifyResult: TagAutoClassifyResult | null = null;

  ngOnInit(): void {
    this.loadAllTags();
    this.loadHotTags();
  }

  loadAllTags(): void {
    this.http.get<Result<Tag[]>>('/api/tags').subscribe({
      next: (res) => {
        if (res.code === 0 && res.data) {
          this.allTags = res.data;
          this.filterTags();
        }
      },
      error: (err) => {
        console.error('加载标签列表失败:', err);
      }
    });
  }

  loadHotTags(): void {
    this.http.get<Result<Tag[]>>(`/api/tags/hot?limit=${this.hotTagLimit}`).subscribe({
      next: (res) => {
        if (res.code === 0 && res.data) {
          this.hotTags = res.data;
        }
      },
      error: (err) => {
        console.error('加载热门标签失败:', err);
      }
    });
  }

  filterTags(): void {
    if (!this.searchKeyword.trim()) {
      this.filteredTags = this.allTags;
      return;
    }
    const keyword = this.searchKeyword.toLowerCase();
    this.filteredTags = this.allTags.filter(tag =>
      tag.tagName.toLowerCase().includes(keyword) ||
      tag.tagCode.toLowerCase().includes(keyword) ||
      (tag.description && tag.description.toLowerCase().includes(keyword))
    );
  }

  isSelected(tag: Tag): boolean {
    return this.selectedTags.some(t => t.id === tag.id);
  }

  toggleTag(tag: Tag): void {
    if (this.isSelected(tag)) {
      this.removeTag(tag);
    } else {
      this.selectedTags = [...this.selectedTags, tag];
      this.selectedTagsChange.emit(this.selectedTags);
    }
  }

  removeTag(tag: Tag): void {
    this.selectedTags = this.selectedTags.filter(t => t.id !== tag.id);
    this.selectedTagsChange.emit(this.selectedTags);
  }

  clearAll(): void {
    this.selectedTags = [];
    this.selectedTagsChange.emit(this.selectedTags);
    this.classifyResult = null;
  }

  handleAutoClassify(): void {
    if (!this.assetId || this.isClassifying) return;

    this.isClassifying = true;
    this.classifyResult = null;

    this.http.post<Result<TagAutoClassifyResult>>(`/api/tags/auto-classify/${this.assetId}`, {}).subscribe({
      next: (res) => {
        this.isClassifying = false;
        if (res.code === 0 && res.data) {
          this.classifyResult = res.data;
          this.selectedTags = res.data.matchedTags;
          this.selectedTagsChange.emit(this.selectedTags);
          this.autoClassifyComplete.emit(res.data);
        }
      },
      error: (err) => {
        this.isClassifying = false;
        console.error('智能分类失败:', err);
      }
    });
  }

  getTagColor(tag: Tag, selected: boolean): string {
    if (selected) {
      return tag.color || '#3b82f6';
    }
    return this.lightenColor(tag.color || '#3b82f6', 0.85);
  }

  getContrastColor(hexColor: string): string {
    const hex = hexColor.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1f2937' : '#ffffff';
  }

  private lightenColor(hex: string, percent: number): string {
    const num = parseInt(hex.replace('#', ''), 16);
    const amt = Math.round(2.55 * (1 - percent) * 100);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00FF) + amt);
    const B = Math.min(255, (num & 0x0000FF) + amt);
    return `rgb(${R}, ${G}, ${B})`;
  }
}
