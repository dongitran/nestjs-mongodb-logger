import { Injectable, Inject, OnModuleDestroy } from '@nestjs/common';
import { MongoLoggerConfig } from '../interfaces/mongo-logger-config.interface';
import { LogEntry } from '../interfaces/log-entry.interface';
import { BatchManager } from './batch-manager';

const MONGO_LOGGER_CONFIG = 'MONGO_LOGGER_CONFIG';

@Injectable()
export class MongoLoggerService implements OnModuleDestroy {
  constructor(
    @Inject(MONGO_LOGGER_CONFIG) private readonly config: MongoLoggerConfig,
    private readonly batchManager: BatchManager,
  ) {}

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
        message: error.message,
        stack: error.stack,
        metadata,
        collection,
      };
    } else {
      logEntry = {
        timestamp: new Date(),
        level: 'error',
        message: 'An unknown error occurred',
        errorDetails: String(error),
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
