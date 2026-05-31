import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-overlay" *ngIf="visible" (click)="handleOverlayClick($event)">
      <div class="modal-container" [style.width]="width" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <span class="modal-title">{{ title }}</span>
          <span class="modal-close" (click)="handleCancel()">×</span>
        </div>
        <div class="modal-body">
          <ng-content></ng-content>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" (click)="handleCancel()">取消</button>
          <button class="btn btn-confirm" (click)="handleConfirm()">确定</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    .modal-container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }
    .modal-header {
      padding: 16px 20px;
      border-bottom: 1px solid #e5e7eb;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .modal-title {
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .modal-close {
      font-size: 24px;
      color: #6b7280;
      cursor: pointer;
      line-height: 1;
    }
    .modal-close:hover {
      color: #374151;
    }
    .modal-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }
    .modal-footer {
      padding: 16px 20px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 14px;
      cursor: pointer;
      border: none;
      transition: all 0.2s;
    }
    .btn-cancel {
      background: #f3f4f6;
      color: #374151;
    }
    .btn-cancel:hover {
      background: #e5e7eb;
    }
    .btn-confirm {
      background: #3b82f6;
      color: white;
    }
    .btn-confirm:hover {
      background: #2563eb;
    }
  `]
})
export class ModalComponent {
  @Input() title = '';
  @Input() visible = false;
  @Input() width = '500px';

  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() onConfirm = new EventEmitter<void>();
  @Output() onCancel = new EventEmitter<void>();

  handleOverlayClick(event: MouseEvent): void {
    this.handleCancel();
  }

  handleConfirm(): void {
    this.onConfirm.emit();
    this.visibleChange.emit(false);
  }

  handleCancel(): void {
    this.onCancel.emit();
    this.visibleChange.emit(false);
  }
}
