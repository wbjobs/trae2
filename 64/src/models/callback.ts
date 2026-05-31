export type CallbackEventType = 'task_status_changed' | 'data_received' | 'device_status_changed' | 'system_alert';

export interface CallbackEvent {
  id: string;
  type: CallbackEventType;
  taskId?: string;
  deviceId?: string;
  timestamp: number;
  payload: Record<string, any>;
}

export interface CallbackSubscription {
  id: string;
  url: string;
  eventTypes: CallbackEventType[];
  taskId?: string;
  deviceId?: string;
  createdBy: string;
  createdAt: number;
  enabled: boolean;
  secret?: string;
}

export interface CallbackDelivery {
  id: string;
  subscriptionId: string;
  eventId: string;
  url: string;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  attemptCount: number;
  lastAttemptAt?: number;
  nextRetryAt?: number;
  responseStatus?: number;
  errorMessage?: string;
}

export interface WebhookRequest {
  eventId: string;
  eventType: CallbackEventType;
  timestamp: number;
  taskId?: string;
  deviceId?: string;
  data: Record<string, any>;
  signature?: string;
}

export interface CallbackSubscriptionRequest {
  url: string;
  eventTypes: CallbackEventType[];
  taskId?: string;
  deviceId?: string;
  secret?: string;
}
