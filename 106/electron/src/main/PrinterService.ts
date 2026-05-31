import * as path from 'path';
import { EventEmitter } from 'events';

let nativeModule: any = null;

try {
  const bindingPath = path.join(__dirname, '../../../native-addon/build/Release/printer_backend.node');
  nativeModule = require(bindingPath);
} catch (error) {
  console.warn('Native module not loaded, using mock implementation');
}

export interface PrinterInfo {
  id: string;
  name: string;
  model: string;
  manufacturer: string;
  port: string;
  isDefault: boolean;
  status: string;
  jobCount: number;
}

export interface JobInfo {
  id: string;
  printerId: string;
  documentName: string;
  userName: string;
  totalPages: number;
  printedPages: number;
  sizeBytes: number;
  submittedTime: number;
  status: string;
}

export interface PrintTask {
  id: string;
  printerId: string;
  documentName: string;
  filePath?: string;
  status: string;
  priority: number;
  priorityLabel?: string;
  progress: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  errorMessage?: string;
}

export interface PriorityOption {
  value: number;
  label: string;
  color: string;
}

export interface PrintTemplate {
  id?: string;
  name: string;
  description?: string;
  type: string;
  width: number;
  height: number;
  unit: string;
  dpi: number;
  content: string;
  createdAt?: number;
  updatedAt?: number;
  version?: number;
  isDefault?: boolean;
}

export interface StatusAlert {
  id: string;
  printerId: string;
  type: string;
  message: string;
  severity: number;
  timestamp: number;
  acknowledged: boolean;
}

export class PrinterService extends EventEmitter {
  private platform: any = null;
  private initialized: boolean = false;
  private tasks: Map<string, PrintTask> = new Map();
  private templates: Map<string, PrintTemplate> = new Map();

  static readonly PRIORITY_OPTIONS: PriorityOption[] = [
    { value: 0, label: '低', color: '#9e9e9e' },
    { value: 1, label: '普通', color: '#2196f3' },
    { value: 2, label: '高', color: '#ff9800' },
    { value: 3, label: '紧急', color: '#f44336' }
  ];

  static getPriorityLabel(priority: number): string {
    const opt = PrinterService.PRIORITY_OPTIONS.find(p => p.value === priority);
    return opt ? opt.label : '普通';
  }

  static getPriorityColor(priority: number): string {
    const opt = PrinterService.PRIORITY_OPTIONS.find(p => p.value === priority);
    return opt ? opt.color : '#2196f3';
  }

  constructor() {
    super();
  }

  initialize(): boolean {
    if (this.initialized) return true;

    try {
      if (nativeModule) {
        this.platform = new nativeModule.Platform();
        this.platform.initialize();
      }
      this.initialized = true;
      return true;
    } catch (error) {
      console.error('Failed to initialize PrinterService:', error);
      return false;
    }
  }

  shutdown(): void {
    if (!this.initialized) return;

    try {
      if (this.platform) {
        this.platform.shutdown();
      }
      this.initialized = false;
    } catch (error) {
      console.error('Error during shutdown:', error);
    }
  }

  enumeratePrinters(): PrinterInfo[] {
    if (!this.platform) {
      return this.getMockPrinters();
    }
    return this.platform.enumeratePrinters();
  }

  getPrinterInfo(printerId: string): PrinterInfo | null {
    if (!this.platform) {
      return this.getMockPrinters().find(p => p.id === printerId) || null;
    }
    return this.platform.getPrinterInfo(printerId);
  }

  printFile(printerId: string, filePath: string, jobName?: string): boolean {
    if (!this.platform) {
      console.log(`Mock printFile: ${filePath} to ${printerId}`);
      return true;
    }
    return this.platform.printFile(printerId, filePath, jobName || '');
  }

  printRawData(printerId: string, data: Uint8Array, jobName?: string): boolean {
    if (!this.platform) {
      console.log(`Mock printRawData: ${data.length} bytes to ${printerId}`);
      return true;
    }
    return this.platform.printRawData(printerId, Buffer.from(data), jobName || '');
  }

  getActiveJobs(printerId: string): JobInfo[] {
    if (!this.platform) {
      return [];
    }
    return this.platform.getActiveJobs(printerId);
  }

  cancelJob(printerId: string, jobId: string): boolean {
    if (!this.platform) {
      return true;
    }
    return this.platform.cancelJob(printerId, jobId);
  }

  cancelAllJobs(printerId: string): boolean {
    if (!this.platform) {
      return true;
    }
    return this.platform.cancelAllJobs(printerId);
  }

  pausePrinter(printerId: string): boolean {
    if (!this.platform) {
      return true;
    }
    return this.platform.pausePrinter(printerId);
  }

  resumePrinter(printerId: string): boolean {
    if (!this.platform) {
      return true;
    }
    return this.platform.resumePrinter(printerId);
  }

  getDefaultPrinterId(): string {
    if (!this.platform) {
      return 'mock-printer-1';
    }
    return this.platform.getDefaultPrinterId();
  }

  setDefaultPrinter(printerId: string): boolean {
    if (!this.platform) {
      return true;
    }
    return this.platform.setDefaultPrinter(printerId);
  }

  addFileTask(printerId: string, filePath: string, documentName: string, settings?: any): string {
    const taskId = this.generateTaskId();
    const priority = settings?.priority ?? 1;
    const task: PrintTask = {
      id: taskId,
      printerId,
      documentName,
      filePath,
      status: 'queued',
      priority,
      priorityLabel: PrinterService.getPriorityLabel(priority),
      progress: 0,
      createdAt: Date.now()
    };

    this.tasks.set(taskId, task);
    this.emit('task-update', task);

    setImmediate(() => this.processTask(taskId));
    return taskId;
  }

  addRawDataTask(printerId: string, data: Uint8Array, documentName: string, settings?: any): string {
    const taskId = this.generateTaskId();
    const priority = settings?.priority ?? 1;
    const task: PrintTask = {
      id: taskId,
      printerId,
      documentName,
      status: 'queued',
      priority,
      priorityLabel: PrinterService.getPriorityLabel(priority),
      progress: 0,
      createdAt: Date.now()
    };

    this.tasks.set(taskId, task);
    this.emit('task-update', task);

    setImmediate(() => this.processTask(taskId));
    return taskId;
  }

  getTaskStatus(taskId: string): PrintTask | undefined {
    return this.tasks.get(taskId);
  }

  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.status = 'cancelled';
    task.completedAt = Date.now();
    this.emit('task-update', task);
    return true;
  }

  setTaskPriority(taskId: string, priority: number): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.priority = priority;
    task.priorityLabel = PrinterService.getPriorityLabel(priority);
    this.emit('task-update', task);
    return true;
  }

  getActiveTasks(): PrintTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'queued' || t.status === 'processing')
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.createdAt - b.createdAt;
      });
  }

  getCompletedTasks(maxCount: number = 100): PrintTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled')
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return b.createdAt - a.createdAt;
      })
      .slice(0, maxCount);
  }

  getAllTasksSortedByPriority(): PrintTask[] {
    return Array.from(this.tasks.values())
      .sort((a, b) => {
        if (a.priority !== b.priority) return b.priority - a.priority;
        return a.createdAt - b.createdAt;
      });
  }

  getAllTemplates(): PrintTemplate[] {
    return Array.from(this.templates.values());
  }

  createTemplate(template: PrintTemplate): string {
    const id = this.generateTemplateId();
    const newTemplate: PrintTemplate = {
      ...template,
      id,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1
    };
    this.templates.set(id, newTemplate);
    return id;
  }

  updateTemplate(templateId: string, template: PrintTemplate): boolean {
    const existing = this.templates.get(templateId);
    if (!existing) return false;

    this.templates.set(templateId, {
      ...existing,
      ...template,
      id: templateId,
      updatedAt: Date.now(),
      version: (existing.version || 1) + 1
    });
    return true;
  }

  deleteTemplate(templateId: string): boolean {
    return this.templates.delete(templateId);
  }

  renderTemplate(templateId: string, options: any): string {
    const template = this.templates.get(templateId);
    if (!template) return '';

    let content = template.content;
    const fieldValues = options?.fieldValues || {};

    for (const [key, value] of Object.entries(fieldValues)) {
      content = content.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
    }

    return content;
  }

  onStatusChange(callback: (status: any) => void): void {
    this.on('status-change', callback);
  }

  onAlert(callback: (alert: StatusAlert) => void): void {
    this.on('alert', callback);
  }

  onCriticalAlert(callback: (alert: StatusAlert) => void): void {
    this.on('alert', (alert: StatusAlert) => {
      if (alert.type === 'paper_out' || alert.type === 'jammed' || alert.type === 'error') {
        callback(alert);
      }
    });
  }

  onTaskUpdate(callback: (task: PrintTask) => void): void {
    this.on('task-update', callback);
  }

  batchImportTemplates(filePaths: string[]): number {
    let importedCount = 0;
    for (const filePath of filePaths) {
      try {
        const fs = require('fs');
        const path = require('path');
        const content = fs.readFileSync(filePath, 'utf-8');
        const name = path.basename(filePath, path.extname(filePath));
        const ext = path.extname(filePath).toLowerCase();

        let type = 'custom';
        if (ext === '.zpl' || ext === '.epl') {
          type = 'barcode';
        }

        const id = this.generateTemplateId();
        const newTemplate: PrintTemplate = {
          id,
          name,
          type,
          width: 100,
          height: 50,
          unit: 'mm',
          dpi: 300,
          content,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          version: 1
        };
        this.templates.set(id, newTemplate);
        importedCount++;
      } catch (error) {
        console.error(`Failed to import template from ${filePath}:`, error);
      }
    }
    return importedCount;
  }

  batchExportTemplates(templateIds: string[], directoryPath: string): number {
    let exportedCount = 0;
    const fs = require('fs');
    const path = require('path');

    for (const templateId of templateIds) {
      const template = this.templates.get(templateId);
      if (!template) continue;

      try {
        let extension = '.json';
        if (template.type === 'barcode') {
          extension = '.zpl';
        }

        const filePath = path.join(directoryPath, template.name + extension);
        fs.writeFileSync(filePath, template.content, 'utf-8');
        exportedCount++;
      } catch (error) {
        console.error(`Failed to export template ${template.name}:`, error);
      }
    }
    return exportedCount;
  }

  private generateTaskId(): string {
    return `TASK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateTemplateId(): string {
    return `TPL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private processTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'processing';
    task.startedAt = Date.now();
    this.emit('task-update', task);

    const simulateProgress = () => {
      const interval = setInterval(() => {
        const currentTask = this.tasks.get(taskId);
        if (!currentTask || currentTask.status !== 'processing') {
          clearInterval(interval);
          return;
        }

        currentTask.progress = Math.min(currentTask.progress + 10, 90);
        this.emit('task-update', currentTask);

        if (currentTask.progress >= 90) {
          clearInterval(interval);

          currentTask.status = 'completed';
          currentTask.progress = 100;
          currentTask.completedAt = Date.now();
          this.emit('task-update', currentTask);
        }
      }, 200);
    };

    simulateProgress();
  }

  private getMockPrinters(): PrinterInfo[] {
    return [
      {
        id: 'mock-printer-1',
        name: 'HP LaserJet Pro',
        model: 'LaserJet Pro M404dn',
        manufacturer: 'HP',
        port: 'USB001',
        isDefault: true,
        status: 'ready',
        jobCount: 2
      },
      {
        id: 'mock-printer-2',
        name: 'Epson WorkForce',
        model: 'WorkForce WF-2835',
        manufacturer: 'Epson',
        port: 'IP_192.168.1.100',
        isDefault: false,
        status: 'printing',
        jobCount: 5
      },
      {
        id: 'mock-printer-3',
        name: 'Canon PIXMA',
        model: 'PIXMA TR8520',
        manufacturer: 'Canon',
        port: 'USB002',
        isDefault: false,
        status: 'offline',
        jobCount: 0
      }
    ];
  }
}
