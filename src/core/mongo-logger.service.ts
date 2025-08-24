import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { LogEntry } from '../interfaces/log-entry.interface';
import { BatchManager } from './batch-manager';
import { inspect } from 'util';

@Injectable()
export class MongoLoggerService implements OnModuleDestroy {
  constructor(private readonly batchManager: BatchManager) {}

  async log(
    collection: string,
    entry: Omit<LogEntry, 'timestamp'>,
  ): Promise<void> {
    const logEntry: LogEntry = {
      ...entry,
      timestamp: new Date(),
      collection,
    };

    await this.batchManager.addToBatch(logEntry);
  }

  async logError(
    collection: string,
    error: unknown,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    let logEntry: LogEntry;

    if (error instanceof Error) {
      logEntry = {
        timestamp: new Date(),
        level: 'error',
        message: error.message || 'Error object without a message',
        stack: error.stack,
        metadata,
        collection,
      };
    } else {
      logEntry = {
        timestamp: new Date(),
        level: 'error',
        message: 'An unknown error occurred',
        errorDetails: inspect(error),
        metadata,
        collection,
      };
    }

    await this.batchManager.addToBatch(logEntry);
  }

  async flush(): Promise<void> {
    await this.batchManager.flushAll();
  }

  async onModuleDestroy(): Promise<void> {
    await this.flush();
  }
}
