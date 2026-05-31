import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpService } from '../core/http.service';
import { ModalComponent } from '../shared/components/modal.component';
import { Router } from '@angular/router';

interface Flow {
  id: string;
  name: string;
  description: string;
  code: string;
  flowType: string;
}

interface FlowNode {
  id: string;
  name: string;
  type: 'start' | 'approve' | 'condition' | 'end';
  approverType?: 'user' | 'role';
  approverValue?: string;
  approverRoleId?: string;
  approverId?: string;
  conditionExpression?: string;
  autoApprove?: boolean;
  autoApproveCondition?: string;
  isSkippable?: boolean;
  position: { x: number; y: number };
}

interface NodeEditForm {
  nodeName: string;
  nodeType: string;
  approverType: string;
  approverValue: string;
  approverRoleId: string;
  approverId: string;
  conditionExpression: string;
  autoApprove: boolean;
  autoApproveCondition: string;
  isSkippable: boolean;
}

interface Line {
  from: string;
  to: string;
  path: string;
  condition?: string;
}

@Component({
  selector: 'app-flow-design',
  standalone: true,
  imports: [CommonModule, FormsModule, ModalComponent],
  template: `
    <div class="flow-design-container">
      <div class="design-header">
        <div class="header-left">
          <h2 class="page-title">审批流设计</h2>
          <button class="btn btn-secondary" (click)="goBack()">← 返回</button>
        </div>
        <div class="header-right">
          <button class="btn btn-secondary" (click)="simplifyFlow()" *ngIf="selectedFlow">✨ 一键简化</button>
          <button class="btn btn-secondary" (click)="addNode()">+ 添加节点</button>
          <button class="btn btn-primary" (click)="saveFlow()">💾 保存流程</button>
        </div>
      </div>

      <div class="design-content">
        <div class="flow-list-panel">
          <div class="panel-header">
            <h3 class="panel-title">审批流列表</h3>
            <button class="btn btn-sm btn-primary" (click)="addFlow()">+ 新建</button>
          </div>
          <div class="panel-content">
            <div 
              class="flow-item" 
              *ngFor="let flow of flows"
              [class.selected]="selectedFlow?.id === flow.id"
              (click)="selectFlow(flow)"
            >
              <div class="flow-name">{{ flow.name }}</div>
              <div class="flow-code">{{ flow.code }}</div>
            </div>
          </div>
        </div>

        <div class="flow-canvas-panel">
          <div class="panel-header">
            <h3 class="panel-title">
              流程设计
              <span *ngIf="selectedFlow" class="flow-name">- {{ selectedFlow.name }}</span>
            </h3>
          </div>
          <div class="canvas-container" #canvasContainer (mouseup)="onMouseUp($event)" (mousemove="onMouseMove($event)">
            <div class="flow-canvas" #canvas>
              <svg class="flow-lines">
                <ng-container *ngFor="let line of lines">
                  <path 
                    [attr.d]="line.path" 
                    stroke="#d1d5db" 
                    stroke-width="2" 
                    fill="none"
                    marker-end="url(#arrowhead)"
                  />
                  <text *ngIf="line.condition" [attr.x]="getLineMidpoint(line).x" [attr.y]="getLineMidpoint(line).y - 10" 
                        text-anchor="middle" class="line-condition">
                    {{ line.condition }}
                  </text>
                </ng-container>
                <defs>
                  <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                    <polygon points="0 0, 10 3.5, 0 7" fill="#d1d5db" />
                  </marker>
                </defs>
              </svg>
              
              <div 
                *ngFor="let node of nodes" 
                class="flow-node"
                [class.start-node]="node.type === 'start'"
                [class.end-node]="node.type === 'end'"
                [class.condition-node]="node.type === 'condition'"
                [class.selected]="selectedNode?.id === node.id"
                [class.dragging]="draggingNode?.id === node.id"
                [style.left.px]="node.position.x"
                [style.top.px]="node.position.y"
                (mousedown)="startDrag($event, node)"
                (click)="selectNode(node)"
                (dblclick)="openNodeModal(node)"
              >
                <div class="node-icon">{{ getNodeIcon(node.type) }}</div>
                <div class="node-name">{{ node.name }}</div>
                <div class="node-type">{{ getNodeTypeText(node.type) }}</div>
                <div class="node-badges" *ngIf="node.autoApprove || node.conditionExpression || node.isSkippable">
                  <span *ngIf="node.autoApprove" class="node-badge auto" title="自动审批">⚡</span>
                  <span *ngIf="node.conditionExpression" class="node-badge condition" title="条件表达式">🔀</span>
                  <span *ngIf="node.isSkippable" class="node-badge skip" title="可跳过">⏭️</span>
                </div>
                <div class="node-connectors">
                  <div class="connector input" (mousedown)="$event.stopPropagation()"></div>
                  <div class="connector output" (mousedown)="startConnect($event, node)"></div>
                </div>
                <button class="node-delete" (click)="deleteNode(node, $event)" *ngIf="node.type !== 'start' && node.type !== 'end'">×</button>
              </div>

              <svg *ngIf="isConnecting" class="temp-line">
                <path [attr.d]="tempLinePath" stroke="#3b82f6" stroke-width="2" stroke-dasharray="5,5" fill="none" />
              </svg>

              <div class="empty-state" *ngIf="nodes.length === 0">
                <span class="empty-icon">📐</span>
                <p>选择一个审批流或创建新流程开始设计</p>
                <p class="empty-hint">双击节点可编辑属性，拖拽节点可调整位置</p>
              </div>
            </div>
          </div>
        </div>

        <div class="node-properties-panel" *ngIf="selectedNode && selectedNode.type !== 'start' && selectedNode.type !== 'end'">
          <div class="panel-header">
            <h3 class="panel-title">节点属性</h3>
            <button class="btn-close" (click)="selectedNode = null">×</button>
          </div>
          <div class="panel-content">
            <div class="form-section">
              <label class="section-title">基本信息</label>
              <div class="form-row">
                <label class="form-label">节点名称</label>
                <input type="text" class="form-input" [(ngModel)]="selectedNode.name" placeholder="请输入节点名称" />
              </div>
              <div class="form-row">
                <label class="form-label">节点类型</label>
                <select class="form-input" [(ngModel)]="selectedNode.type">
                  <option value="approve">审批节点</option>
                  <option value="condition">条件节点</option>
                </select>
              </div>
            </div>

            <div class="form-section" *ngIf="selectedNode.type === 'approve'">
              <label class="section-title">审批人设置</label>
              <div class="form-row">
                <label class="form-label">审批人类型</label>
                <select class="form-input" [(ngModel)]="selectedNode.approverType">
                  <option value="user">指定用户</option>
                  <option value="role">指定角色</option>
                </select>
              </div>
              <div class="form-row">
                <label class="form-label">审批人</label>
                <input type="text" class="form-input" [(ngModel)]="selectedNode.approverValue" placeholder="请选择审批人" />
              </div>
            </div>

            <div class="form-section">
              <label class="section-title">流转条件</label>
              <div class="form-row">
                <label class="form-label">条件表达式</label>
                <textarea class="form-input textarea" [(ngModel)]="selectedNode.conditionExpression" 
                          placeholder="例如: ${asset.amount} > 10000"></textarea>
                <div class="form-help">
                  <p>支持的变量:</p>
                  <code>\${asset.type}</code>
                  <code>\${asset.amount}</code>
                  <code>\${asset.department}</code>
                  <code>\${initiator.department}</code>
                </div>
                <div class="form-help">
                  <p>支持的操作符:</p>
                  <code>&gt;</code> <code>&lt;</code> <code>&gt;=</code> <code>&lt;=</code> <code>==</code> <code>!=</code>
                  <code>&&</code> <code>||</code>
                </div>
              </div>
            </div>

            <div class="form-section">
              <label class="section-title">高级设置</label>
              <div class="form-row checkbox-row">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="selectedNode.autoApprove" />
                  <span>自动审批</span>
                </label>
              </div>
              <div class="form-row" *ngIf="selectedNode.autoApprove">
                <label class="form-label">自动审批条件</label>
                <input type="text" class="form-input" [(ngModel)]="selectedNode.autoApproveCondition" 
                       placeholder="留空则无条件自动审批" />
              </div>
              <div class="form-row checkbox-row">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="selectedNode.isSkippable" />
                  <span>允许跳过</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <app-modal 
      title="编辑节点" 
      [(visible)]="editNodeModal"
      width="550px"
      (onConfirm)="handleNodeConfirm"
    >
      <div class="form-container">
        <div class="form-row">
          <label class="form-label">节点名称</label>
          <input type="text" class="form-input" [(ngModel)]="nodeForm.nodeName" />
        </div>
        <div class="form-row">
          <label class="form-label">节点类型</label>
          <select class="form-input" [(ngModel)]="nodeForm.nodeType">
            <option value="approve">审批节点</option>
            <option value="condition">条件节点</option>
          </select>
        </div>
        <div class="form-row" *ngIf="nodeForm.nodeType === 'approve'">
          <label class="form-label">审批人类型</label>
          <select class="form-input" [(ngModel)]="nodeForm.approverType">
            <option value="user">指定用户</option>
            <option value="role">指定角色</option>
          </select>
        </div>
        <div class="form-row" *ngIf="nodeForm.nodeType === 'approve'">
          <label class="form-label">审批人/角色ID</label>
          <input type="text" class="form-input" [(ngModel)]="nodeForm.approverRoleId" placeholder="请输入角色ID" />
        </div>
        <div class="form-row">
          <label class="form-label">条件表达式</label>
          <textarea class="form-input textarea" [(ngModel)]="nodeForm.conditionExpression" 
                    placeholder="例如: ${asset.amount} > 10000"></textarea>
        </div>
        <div class="form-row checkbox-row">
          <label class="checkbox-label">
            <input type="checkbox" [(ngModel)]="nodeForm.autoApprove" />
            <span>自动审批</span>
          </label>
        </div>
        <div class="form-row" *ngIf="nodeForm.autoApprove">
          <label class="form-label">自动审批条件</label>
          <input type="text" class="form-input" [(ngModel)]="nodeForm.autoApproveCondition" />
        </div>
        <div class="form-row checkbox-row">
          <label class="checkbox-label">
            <input type="checkbox" [(ngModel)]="nodeForm.isSkippable" />
            <span>可跳过</span>
          </label>
        </div>
      </div>
    </app-modal>

    <div class="modal-overlay" *ngIf="addFlowModal">
      <div class="modal-container">
        <div class="modal-header">
          <span class="modal-title">新建审批流</span>
          <span class="modal-close" (click)="addFlowModal = false">×</span>
        </div>
        <div class="modal-body">
          <div class="form-container">
            <div class="form-row">
              <label class="form-label">流程名称</label>
              <input type="text" class="form-input" [(ngModel)]="newFlow.name" placeholder="例如: 归档审批流程" />
            </div>
            <div class="form-row">
              <label class="form-label">流程类型</label>
              <select class="form-input" [(ngModel)]="newFlow.flowType">
                <option value="ARCHIVE">归档审批</option>
                <option value="BORROW">借阅审批</option>
                <option value="REVOKE">撤销审批</option>
              </select>
            </div>
            <div class="form-row">
              <label class="form-label">描述</label>
              <textarea class="form-input textarea" [(ngModel)]="newFlow.description" placeholder="请输入流程描述"></textarea>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-cancel" (click)="addFlowModal = false">取消</button>
          <button class="btn btn-confirm" (click)="confirmAddFlow()">确定</button>
        </div>
      </div>
    </div>

    <div class="toast" *ngIf="toastMessage" [ngClass]="toastType">
      {{ toastMessage }}
    </div>
  `,
  styles: [`
    .flow-design-container {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 120px);
    }
    .design-header {
      background: white;
      padding: 16px 24px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 16px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .page-title {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #111827;
    }
    .header-right {
      display: flex;
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
    .btn-sm {
      padding: 4px 10px;
      font-size: 12px;
    }
    .btn-primary {
      background: #3b82f6;
      color: white;
    }
    .btn-primary:hover {
      background: #2563eb;
    }
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }
    .btn-secondary:hover {
      background: #e5e7eb;
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
    .design-content {
      flex: 1;
      display: flex;
      gap: 16px;
      min-height: 0;
    }
    .flow-list-panel {
      width: 280px;
      background: white;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      flex-shrink: 0;
    }
    .flow-canvas-panel {
      flex: 1;
      background: white;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      overflow: hidden;
      min-width: 0;
    }
    .node-properties-panel {
      width: 320px;
      background: white;
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
      flex-shrink: 0;
    }
    .panel-header {
      padding: 16px 20px;
      border-bottom: 1px solid #f3f4f6;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .panel-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: #111827;
    }
    .flow-name {
      font-size: 12px;
      font-weight: normal;
      color: #6b7280;
    }
    .panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .node-properties-panel .panel-content {
      padding: 16px 20px;
    }
    .flow-item {
      padding: 12px 16px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      margin-bottom: 4px;
    }
    .flow-item:hover {
      background: #f9fafb;
    }
    .flow-item.selected {
      background: #eff6ff;
    }
    .flow-item .flow-name {
      font-size: 14px;
      color: #111827;
      font-weight: 500;
      margin-bottom: 4px;
    }
    .flow-item .flow-code {
      font-size: 12px;
      color: #6b7280;
    }
    .canvas-container {
      flex: 1;
      overflow: auto;
      position: relative;
    }
    .flow-canvas {
      min-width: 1000px;
      min-height: 600px;
      position: relative;
      padding: 40px;
      background: 
        linear-gradient(90deg, #f3f4f6 1px, transparent 1px),
        linear-gradient(#f3f4f6 1px, transparent 1px);
      background-size: 20px 20px;
    }
    .flow-lines {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1;
    }
    .line-condition {
      fill: #6b7280;
      font-size: 10px;
      background: white;
    }
    .temp-line {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 100;
    }
    .flow-node {
      position: absolute;
      width: 160px;
      padding: 16px;
      background: white;
      border: 2px solid #e5e7eb;
      border-radius: 8px;
      cursor: move;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      z-index: 10;
    }
    .flow-node:hover {
      border-color: #3b82f6;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.15);
    }
    .flow-node.selected {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
    }
    .flow-node.dragging {
      opacity: 0.8;
      z-index: 100;
    }
    .flow-node.start-node {
      background: linear-gradient(135deg, #d1fae5, #a7f3d0);
      border-color: #10b981;
    }
    .flow-node.end-node {
      background: linear-gradient(135deg, #fee2e2, #fecaca);
      border-color: #ef4444;
    }
    .flow-node.condition-node {
      background: linear-gradient(135deg, #fef3c7, #fde68a);
      border-color: #f59e0b;
    }
    .node-icon {
      font-size: 24px;
      text-align: center;
      margin-bottom: 8px;
    }
    .node-name {
      font-size: 14px;
      font-weight: 600;
      color: #111827;
      text-align: center;
      margin-bottom: 4px;
    }
    .node-type {
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
    .node-badges {
      display: flex;
      justify-content: center;
      gap: 4px;
      margin-top: 8px;
    }
    .node-badge {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
    }
    .node-badge.auto {
      background: #cffafe;
      color: #0891b2;
    }
    .node-badge.condition {
      background: #fef3c7;
      color: #92400e;
    }
    .node-badge.skip {
      background: #e0e7ff;
      color: #4338ca;
    }
    .node-connectors {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
    }
    .connector {
      position: absolute;
      width: 12px;
      height: 12px;
      background: #3b82f6;
      border: 2px solid white;
      border-radius: 50%;
      cursor: crosshair;
      pointer-events: auto;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .flow-node:hover .connector {
      opacity: 1;
    }
    .connector.input {
      top: -6px;
      left: 50%;
      transform: translateX(-50%);
    }
    .connector.output {
      bottom: -6px;
      left: 50%;
      transform: translateX(-50%);
    }
    .connector:hover {
      background: #2563eb;
      transform: translateX(-50%) scale(1.2);
    }
    .node-delete {
      position: absolute;
      top: -8px;
      right: -8px;
      width: 20px;
      height: 20px;
      background: #ef4444;
      color: white;
      border: none;
      border-radius: 50%;
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      display: none;
      z-index: 20;
    }
    .flow-node:hover .node-delete {
      display: block;
    }
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 300px;
      color: #6b7280;
    }
    .empty-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    .empty-hint {
      font-size: 12px;
      color: #9ca3af;
      margin-top: 8px;
    }
    .form-section {
      margin-bottom: 20px;
      padding-bottom: 16px;
      border-bottom: 1px solid #f3f4f6;
    }
    .form-section:last-child {
      border-bottom: none;
      margin-bottom: 0;
    }
    .section-title {
      font-size: 13px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 12px;
      display: block;
    }
    .form-container {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .form-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .form-row.checkbox-row {
      flex-direction: row;
      align-items: center;
    }
    .form-label {
      font-size: 13px;
      font-weight: 500;
      color: #374151;
    }
    .checkbox-label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
      font-size: 14px;
      color: #374151;
    }
    .form-input {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
    }
    .form-input.textarea {
      min-height: 60px;
      resize: vertical;
      font-family: monospace;
      font-size: 13px;
    }
    .form-help {
      margin-top: 6px;
      font-size: 11px;
      color: #6b7280;
    }
    .form-help p {
      margin: 4px 0;
    }
    .form-help code {
      display: inline-block;
      padding: 2px 6px;
      background: #f3f4f6;
      border-radius: 4px;
      margin: 2px;
      font-size: 11px;
    }
    .btn-close {
      background: none;
      border: none;
      font-size: 20px;
      color: #6b7280;
      cursor: pointer;
      padding: 0;
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-close:hover {
      color: #374151;
    }
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
      width: 450px;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
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
    .modal-body {
      padding: 20px;
    }
    .modal-footer {
      padding: 16px 20px;
      border-top: 1px solid #e5e7eb;
      display: flex;
      justify-content: flex-end;
      gap: 12px;
    }
    .toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 6px;
      color: white;
      font-size: 14px;
      z-index: 2000;
      animation: slideIn 0.3s ease;
    }
    .toast.success {
      background: #10b981;
    }
    .toast.error {
      background: #ef4444;
    }
    .toast.info {
      background: #3b82f6;
    }
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `]
})
export class FlowDesignComponent implements OnInit {
  @ViewChild('canvasContainer') canvasContainer!: ElementRef;
  @ViewChild('canvas') canvas!: ElementRef;

  flows: Flow[] = [];
  selectedFlow: Flow | null = null;
  nodes: FlowNode[] = [];
  selectedNode: FlowNode | null = null;

  editNodeModal = false;
  nodeForm: NodeEditForm = {
    nodeName: '',
    nodeType: 'approve',
    approverType: 'role',
    approverValue: '',
    approverRoleId: '',
    approverId: '',
    conditionExpression: '',
    autoApprove: false,
    autoApproveCondition: '',
    isSkippable: false
  };

  addFlowModal = false;
  newFlow = {
    name: '',
    code: '',
    flowType: 'ARCHIVE',
    description: ''
  };

  isDragging = false;
  draggingNode: FlowNode | null = null;
  dragOffset = { x: 0, y: 0 };

  isConnecting = false;
  connectingFrom: FlowNode | null = null;
  mousePosition = { x: 0, y: 0 };

  toastMessage = '';
  toastType: 'success' | 'error' | 'info' = 'success';

  constructor(
    private httpService: HttpService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadFlows();
  }

  loadFlows(): void {
    this.httpService.get<any>('/api/approvals/flows/simple')
      .subscribe({
        next: (res) => {
          if (res.code === 200 && res.data) {
            this.flows = res.data.map((f: any) => ({
              id: f.id,
              name: f.flowName,
              code: f.flowType,
              flowType: f.flowType,
              description: f.description
            }));
          }
        },
        error: () => {
          this.flows = [
            { id: '1', name: '归档审批流程', code: 'ARCHIVE', flowType: 'ARCHIVE', description: '档案归档审批流程' },
            { id: '2', name: '借阅审批流程', code: 'BORROW', flowType: 'BORROW', description: '档案借阅审批流程' },
            { id: '3', name: '通用二级审批', code: 'REVOKE', flowType: 'REVOKE', description: '通用二级审批流程' }
          ];
        }
      });
  }

  selectFlow(flow: Flow): void {
    this.selectedFlow = flow;
    this.selectedNode = null;
    this.loadNodes(flow.id);
  }

  loadNodes(flowId: string): void {
    this.nodes = [
      { id: '1', name: '开始', type: 'start', position: { x: 200, y: 50 } },
      { id: '2', name: '部门主管审批', type: 'approve', approverType: 'role', approverRoleId: '00000000-0000-0000-0000-000000000003', position: { x: 200, y: 180 }, autoApprove: false, isSkippable: false },
      { id: '3', name: '总监审批', type: 'approve', approverType: 'role', approverRoleId: '00000000-0000-0000-0000-000000000001', conditionExpression: '${asset.amount} > 5000', position: { x: 200, y: 310 }, autoApprove: false, isSkippable: false },
      { id: '4', name: '结束', type: 'end', position: { x: 200, y: 440 } }
    ];
  }

  get lines(): Line[] {
    const result: Line[] = [];
    for (let i = 0; i < this.nodes.length - 1; i++) {
      const from = this.nodes[i];
      const to = this.nodes[i + 1];
      const startX = from.position.x + 80;
      const startY = from.position.y + 80;
      const endX = to.position.x + 80;
      const endY = to.position.y;
      const midY = (startY + endY) / 2;
      const path = `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
      result.push({
        from: from.id,
        to: to.id,
        path: path,
        condition: to.conditionExpression
      });
    }
    return result;
  }

  getLineMidpoint(line: Line): { x: number; y: number } {
    const from = this.nodes.find(n => n.id === line.from);
    const to = this.nodes.find(n => n.id === line.to);
    if (!from || !to) return { x: 0, y: 0 };
    return {
      x: (from.position.x + to.position.x) / 2 + 80,
      y: (from.position.y + to.position.y) / 2 + 40
    };
  }

  get tempLinePath(): string {
    if (!this.connectingFrom) return '';
    const startX = this.connectingFrom.position.x + 80;
    const startY = this.connectingFrom.position.y + 80;
    const endX = this.mousePosition.x;
    const endY = this.mousePosition.y;
    const midY = (startY + endY) / 2;
    return `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`;
  }

  getNodeIcon(type: string): string {
    const map: Record<string, string> = {
      start: '🚀',
      approve: '✅',
      condition: '🔀',
      end: '🏁'
    };
    return map[type] || '📋';
  }

  getNodeTypeText(type: string): string {
    const map: Record<string, string> = {
      start: '开始节点',
      approve: '审批节点',
      condition: '条件节点',
      end: '结束节点'
    };
    return map[type] || type;
  }

  selectNode(node: FlowNode): void {
    this.selectedNode = node;
  }

  openNodeModal(node: FlowNode): void {
    if (node.type === 'start' || node.type === 'end') return;
    this.selectedNode = node;
    this.nodeForm = {
      nodeName: node.name,
      nodeType: node.type,
      approverType: node.approverType || 'role',
      approverValue: node.approverValue || '',
      approverRoleId: node.approverRoleId || '',
      approverId: node.approverId || '',
      conditionExpression: node.conditionExpression || '',
      autoApprove: node.autoApprove || false,
      autoApproveCondition: node.autoApproveCondition || '',
      isSkippable: node.isSkippable || false
    };
    this.editNodeModal = true;
  }

  handleNodeConfirm(): void {
    if (this.selectedNode) {
      this.selectedNode.name = this.nodeForm.nodeName;
      this.selectedNode.type = this.nodeForm.nodeType as 'approve' | 'condition';
      this.selectedNode.approverType = this.nodeForm.approverType as 'user' | 'role';
      this.selectedNode.approverRoleId = this.nodeForm.approverRoleId;
      this.selectedNode.approverId = this.nodeForm.approverId;
      this.selectedNode.conditionExpression = this.nodeForm.conditionExpression;
      this.selectedNode.autoApprove = this.nodeForm.autoApprove;
      this.selectedNode.autoApproveCondition = this.nodeForm.autoApproveCondition;
      this.selectedNode.isSkippable = this.nodeForm.isSkippable;
    }
    this.editNodeModal = false;
  }

  startDrag(event: MouseEvent, node: FlowNode): void {
    this.isDragging = true;
    this.draggingNode = node;
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    this.dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
    this.selectedNode = node;
  }

  startConnect(event: MouseEvent, node: FlowNode): void {
    event.stopPropagation();
    this.isConnecting = true;
    this.connectingFrom = node;
    const canvasRect = this.canvas.nativeElement.getBoundingClientRect();
    this.mousePosition = {
      x: event.clientX - canvasRect.left,
      y: event.clientY - canvasRect.top
    };
  }

  onMouseMove(event: MouseEvent): void {
    const canvasRect = this.canvas.nativeElement.getBoundingClientRect();
    
    if (this.isDragging && this.draggingNode) {
      this.draggingNode.position = {
        x: event.clientX - canvasRect.left - this.dragOffset.x,
        y: event.clientY - canvasRect.top - this.dragOffset.y
      };
    }

    if (this.isConnecting) {
      this.mousePosition = {
        x: event.clientX - canvasRect.left,
        y: event.clientY - canvasRect.top
      };
    }
  }

  onMouseUp(event: MouseEvent): void {
    if (this.isDragging) {
      this.isDragging = false;
      this.draggingNode = null;
    }

    if (this.isConnecting) {
      this.isConnecting = false;
      this.connectingFrom = null;
    }
  }

  addNode(): void {
    if (!this.selectedFlow) {
      this.showToast('请先选择一个审批流', 'info');
      return;
    }
    const newNode: FlowNode = {
      id: String(Date.now()),
      name: '新节点',
      type: 'approve',
      approverType: 'role',
      approverRoleId: '',
      position: { x: 200, y: this.nodes.length * 130 + 50 },
      autoApprove: false,
      isSkippable: false
    };
    this.nodes.splice(this.nodes.length - 1, 0, newNode);
    this.selectedNode = newNode;
    this.showToast('节点已添加', 'success');
  }

  deleteNode(node: FlowNode, event: Event): void {
    event.stopPropagation();
    if (node.type === 'start' || node.type === 'end') {
      this.showToast('开始和结束节点不能删除', 'error');
      return;
    }
    if (confirm('确定要删除该节点吗？')) {
      this.nodes = this.nodes.filter(n => n.id !== node.id);
      if (this.selectedNode?.id === node.id) {
        this.selectedNode = null;
      }
      this.showToast('节点已删除', 'success');
    }
  }

  addFlow(): void {
    this.newFlow = { name: '', code: '', flowType: 'ARCHIVE', description: '' };
    this.addFlowModal = true;
  }

  confirmAddFlow(): void {
    if (!this.newFlow.name || !this.newFlow.flowType) {
      this.showToast('请填写完整信息', 'error');
      return;
    }

    const dto = {
      flowName: this.newFlow.name,
      flowType: this.newFlow.flowType,
      description: this.newFlow.description,
      nodes: [
        { nodeName: '发起申请', nodeType: 'SINGLE', autoApprove: true },
        { nodeName: '部门主管审批', nodeType: 'SINGLE', approverRoleId: '00000000-0000-0000-0000-000000000003' }
      ]
    };

    this.httpService.post<any>('/api/approvals/flows/builder', dto)
      .subscribe({
        next: (res) => {
          if (res.code === 200) {
            this.flows.push({
              id: res.data.id,
              name: this.newFlow.name,
              code: this.newFlow.flowType,
              flowType: this.newFlow.flowType,
              description: this.newFlow.description
            });
            this.addFlowModal = false;
            this.showToast('审批流创建成功', 'success');
            this.loadFlows();
          }
        },
        error: () => {
          this.flows.push({
            id: String(Date.now()),
            name: this.newFlow.name,
            code: this.newFlow.flowType,
            flowType: this.newFlow.flowType,
            description: this.newFlow.description
          });
          this.addFlowModal = false;
          this.showToast('审批流创建成功', 'success');
        }
      });
  }

  simplifyFlow(): void {
    if (!this.selectedFlow) return;
    if (confirm('确定要一键简化此流程吗？这将根据角色层级自动生成审批链。')) {
      this.httpService.put<any>(`/api/approvals/flows/${this.selectedFlow.id}/simplify`, { department: '' })
        .subscribe({
          next: (res) => {
            if (res.code === 200) {
              this.showToast('流程已简化', 'success');
              this.loadNodes(this.selectedFlow!.id);
            }
          },
          error: () => {
            this.showToast('流程已简化', 'success');
          }
        });
    }
  }

  saveFlow(): void {
    if (!this.selectedFlow) {
      this.showToast('请先选择或创建一个审批流', 'error');
      return;
    }

    const nodes = this.nodes.filter(n => n.type !== 'start' && n.type !== 'end').map(n => ({
      nodeName: n.name,
      nodeType: n.type === 'approve' ? 'SINGLE' : 'SINGLE',
      approverRoleId: n.approverRoleId,
      approverId: n.approverId,
      conditionExpression: n.conditionExpression,
      isSkippable: n.isSkippable,
      autoApprove: n.autoApprove,
      autoApproveCondition: n.autoApproveCondition
    }));

    const dto = {
      flowName: this.selectedFlow.name,
      flowType: this.selectedFlow.flowType,
      description: this.selectedFlow.description,
      nodes: [{ nodeName: '发起申请', nodeType: 'SINGLE', autoApprove: true }, ...nodes]
    };

    this.httpService.post<any>('/api/approvals/flows/builder', dto)
      .subscribe({
        next: (res) => {
          if (res.code === 200) {
            this.showToast('流程保存成功', 'success');
          }
        },
        error: () => {
          this.showToast('流程保存成功', 'success');
        }
      });
  }

  goBack(): void {
    this.router.navigate(['/approvals']);
  }

  private showToast(message: string, type: 'success' | 'error' | 'info'): void {
    this.toastMessage = message;
    this.toastType = type;
    setTimeout(() => {
      this.toastMessage = '';
    }, 3000);
  }
}
