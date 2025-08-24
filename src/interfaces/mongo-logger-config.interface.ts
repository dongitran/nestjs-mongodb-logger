import { MongoClientOptions } from 'mongodb';

export interface MongoLoggerConfig {
  uri: string;
  defaultCollection?: string;
  batchSize?: number;
  flushInterval?: number;
  maxMemoryUsage?: number;
  retryDelay?: number;
  connectionOptions?: MongoClientOptions;
  enableMetrics?: boolean;
  logLevel?: 'error' | 'warn' | 'info';
  gracefulShutdownTimeout?: number;
}

import { ModuleMetadata } from '@nestjs/common';

export interface MongoLoggerAsyncConfig
  extends Pick<ModuleMetadata, 'imports'> {
  useFactory: (
    ...args: any[]
  ) => Promise<MongoLoggerConfig> | MongoLoggerConfig;
  inject?: any[];
}
