export type TaskStatus = 'pending' | 'queued' | 'assigned' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export type ScanMode = 'PPI' | 'RHI' | 'VOL' | 'SUR' | 'MAN';

export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface TaskTrace {
  status: TaskStatus;
  timestamp: number;
  details?: Record<string, any>;
}

export interface ScanTask {
  id: string;
  name: string;
  description?: string;
  priority: Priority;
  originalPriority: Priority;
  status: TaskStatus;
  scanMode: ScanMode;
  radarId?: string;
  parameters: ScanParameters;
  callbackUrl?: string;
  createdBy: string;
  createdAt: number;
  queuedAt?: number;
  assignedAt?: number;
  startedAt?: number;
  completedAt?: number;
  failedAt?: number;
  progress: number;
  errorMessage?: string;
  errorStack?: string;
  errorCode?: string;
  retryCount: number;
  maxRetryCount: number;
  timeout?: number;
  deadline?: number;
  traces: TaskTrace[];
  parentTaskId?: string;
  childTaskIds?: string[];
  lastHeartbeat?: number;
}

export interface ScanParameters {
  elevationAngles?: number[];
  azimuthStart?: number;
  azimuthEnd?: number;
  azimuthStep?: number;
  range: number;
  resolution: number;
  dataTypes: Array<'reflectivity' | 'velocity' | 'spectrum_width' | 'differential_reflectivity' | 'correlation_coefficient'>;
  pulseWidth?: number;
  prf?: number;
  numberOfSamples?: number;
}

export interface TaskCreateRequest {
  name: string;
  description?: string;
  priority: Priority;
  scanMode: ScanMode;
  radarId?: string;
  parameters: ScanParameters;
  callbackUrl?: string;
  timeout?: number;
  maxRetryCount?: number;
  parentTaskId?: string;
}

export interface TaskUpdateRequest {
  status?: TaskStatus;
  progress?: number;
  errorMessage?: string;
  errorStack?: string;
  errorCode?: string;
}

export interface TaskPriorityUpdateRequest {
  priority: Priority;
  reason?: string;
}

export interface TaskQuery {
  status?: TaskStatus;
  radarId?: string;
  priority?: Priority;
  createdBy?: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

export interface TaskTraceResult {
  taskId: string;
  taskName: string;
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
  failedAt?: number;
  traces: TaskTrace[];
  errorMessage?: string;
  errorCode?: string;
  retryCount: number;
  executionTime?: number;
  parentTaskId?: string;
  childTaskIds?: string[];
}
