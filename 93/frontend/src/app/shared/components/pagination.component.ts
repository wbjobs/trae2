import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="pagination-container">
      <span class="total-info">共 {{ total }} 条</span>
      <div class="pagination-buttons">
        <button class="page-btn" [disabled]="pageNum <= 1" (click)="goToPage(pageNum - 1)">
          上一页
        </button>
        <ng-container *ngIf="totalPages > 0">
          <ng-container *ngFor="let page of displayPages">
            <button 
              *ngIf="page !== '...'"
              class="page-btn"
              [class.active]="page === pageNum"
              (click)="goToPage(page)"
            >
              {{ page }}
            </button>
            <span *ngIf="page === '...'" class="ellipsis">...</span>
          </ng-container>
        </ng-container>
        <button class="page-btn" [disabled]="pageNum >= totalPages" (click)="goToPage(pageNum + 1)">
          下一页
        </button>
      </div>
    </div>
  `,
  styles: [`
    .pagination-container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 0;
    }
    .total-info {
      font-size: 14px;
      color: #6b7280;
    }
    .pagination-buttons {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .page-btn {
      min-width: 32px;
      height: 32px;
      padding: 0 12px;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 6px;
      font-size: 14px;
      color: #374151;
      cursor: pointer;
      transition: all 0.2s;
    }
    .page-btn:hover:not(:disabled):not(.active) {
      background: #f3f4f6;
      border-color: #9ca3af;
    }
    .page-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .page-btn.active {
      background: #3b82f6;
      border-color: #3b82f6;
      color: white;
    }
    .ellipsis {
      padding: 0 8px;
      color: #6b7280;
    }
  `]
})
export class PaginationComponent {
  @Input() total = 0;
  @Input() pageNum = 1;
  @Input() pageSize = 10;

  @Output() pageChange = new EventEmitter<number>();

  get totalPages(): number {
    return Math.ceil(this.total / this.pageSize);
  }

  get displayPages(): (number | string)[] {
    const pages: (number | string)[] = [];
    const total = this.totalPages;
    const current = this.pageNum;

    if (total <= 7) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      if (current <= 4) {
        for (let i = 1; i <= 5; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(total);
      } else if (current >= total - 3) {
        pages.push(1);
        pages.push('...');
        for (let i = total - 4; i <= total; i++) {
          pages.push(i);
        }
      } else {
        pages.push(1);
        pages.push('...');
        for (let i = current - 1; i <= current + 1; i++) {
          pages.push(i);
        }
        pages.push('...');
        pages.push(total);
      }
    }

    return pages;
  }

  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.pageNum) {
      this.pageChange.emit(page);
    }
  }
}
