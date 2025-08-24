export interface LogEntry {
  timestamp: Date;
  level?: string;
  message?: string;
  metadata?: Record<string, unknown>;
  collection?: string;
  [key: string]: unknown;
}

export interface BatchLogEntry extends LogEntry {
  _batchId: string;
  _retryCount?: number;
}
