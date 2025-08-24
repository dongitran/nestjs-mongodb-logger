import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { MongoLoggerConfig } from '../interfaces/mongo-logger-config.interface';
import { LogEntry, BatchLogEntry } from '../interfaces/log-entry.interface';
import { ConnectionManager } from './connection-manager';
import { v4 as uuidv4 } from 'uuid';

const MONGO_LOGGER_CONFIG = 'MONGO_LOGGER_CONFIG';

interface CollectionBatch {
  entries: BatchLogEntry[];
  lastFlush: number;
  memorySize: number;
}

interface BatchMetrics {
  totalEntriesProcessed: number;
  totalBatchesFlushed: number;
  totalFlushFailures: number;
  totalRetries: number;
  averageBatchSize: number;
  lastFlushTime: Date | null;
  currentMemoryUsage: number;
  collectionsActive: number;
}

@Injectable()
export class BatchManager implements OnModuleDestroy {
  private readonly logger = new Logger(BatchManager.name);
  private readonly batches = new Map<string, CollectionBatch>();
  private flushTimer: NodeJS.Timeout | null = null;
  private isShuttingDown = false;

  private readonly batchSize: number;
  private readonly flushInterval: number;
  private readonly maxMemoryUsage: number;

  private metrics: BatchMetrics = {
    totalEntriesProcessed: 0,
    totalBatchesFlushed: 0,
    totalFlushFailures: 0,
    totalRetries: 0,
    averageBatchSize: 0,
    lastFlushTime: null,
    currentMemoryUsage: 0,
    collectionsActive: 0,
  };

  constructor(
    @Inject(MONGO_LOGGER_CONFIG) private readonly config: MongoLoggerConfig,
    private readonly connectionManager: ConnectionManager,
  ) {
    this.batchSize = config.batchSize || 500;
    this.flushInterval = config.flushInterval || 5000;
    this.maxMemoryUsage = (config.maxMemoryUsage || 100) * 1024 * 1024;

    this.startFlushTimer();
  }

  async addToBatch(entry: LogEntry): Promise<void> {
    if (this.isShuttingDown) {
      await this.flushEntry(entry);
      return;
    }

    const collection =
      entry.collection || this.config.defaultCollection || 'logs';
    const batchEntry: BatchLogEntry = {
      ...entry,
      _batchId: uuidv4(),
    };

    if (!this.batches.has(collection)) {
      this.batches.set(collection, {
        entries: [],
        lastFlush: Date.now(),
        memorySize: 0,
      });
    }

    const batch = this.batches.get(collection)!;
    batch.entries.push(batchEntry);
    batch.memorySize += this.estimateEntrySize(batchEntry);

    this.metrics.totalEntriesProcessed++;
    this.updateMetrics();

    if (
      batch.entries.length >= this.batchSize ||
      this.shouldFlushDueToMemory()
    ) {
      await this.flushCollection(collection);
    }
  }

  public getMetrics(): BatchMetrics {
    this.updateMetrics();
    return { ...this.metrics };
  }

  private updateMetrics(): void {
    this.metrics.currentMemoryUsage = Array.from(this.batches.values()).reduce(
      (sum, batch) => sum + batch.memorySize,
      0,
    );
    this.metrics.collectionsActive = this.batches.size;

    const totalEntries = Array.from(this.batches.values()).reduce(
      (sum, batch) => sum + batch.entries.length,
      0,
    );
    this.metrics.averageBatchSize =
      totalEntries > 0 ? totalEntries / this.batches.size : 0;
  }

  private async flushEntry(entry: LogEntry): Promise<void> {
    try {
      const db = await this.connectionManager.getDatabase();
      const collection =
        entry.collection || this.config.defaultCollection || 'logs';
      await db.collection(collection).insertOne(entry);
    } catch (error) {
      this.logger.error('Failed to flush single entry', error);
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(async () => {
      await this.flushStaleCollections();
    }, this.flushInterval);
  }

  private async flushStaleCollections(): Promise<void> {
    const now = Date.now();
    const promises: Promise<void>[] = [];

    for (const [collection, batch] of this.batches.entries()) {
      if (
        batch.entries.length > 0 &&
        now - batch.lastFlush >= this.flushInterval
      ) {
        promises.push(this.flushCollection(collection));
      }
    }

    await Promise.allSettled(promises);
  }

  private async flushCollection(collectionName: string): Promise<void> {
    const batch = this.batches.get(collectionName);
    if (!batch || batch.entries.length === 0) {
      return;
    }

    const entries = [...batch.entries];
    const batchSize = entries.length;
    batch.entries = [];
    batch.lastFlush = Date.now();
    batch.memorySize = 0;

    try {
      const db = await this.connectionManager.getDatabase();
      const collection = db.collection(collectionName);

      const cleanEntries = entries.map(entry => {
        const { _batchId: _, _retryCount: __, ...cleanEntry } = entry;
        return cleanEntry;
      });

      await collection.insertMany(cleanEntries, { ordered: false });

      this.metrics.totalBatchesFlushed++;
      this.metrics.lastFlushTime = new Date();
      this.logger.debug(`Flushed ${batchSize} entries to ${collectionName}`);
    } catch (error) {
      this.metrics.totalFlushFailures++;
      this.logger.error(`Failed to flush batch to ${collectionName}`, error);
      await this.handleBatchError(collectionName, entries);
    }
  }

  private async handleBatchError(
    collectionName: string,
    entries: BatchLogEntry[],
  ): Promise<void> {
    const maxRetries = 3;
    const retryableEntries = entries.filter(
      entry => (entry._retryCount || 0) < maxRetries,
    );

    if (retryableEntries.length > 0) {
      this.metrics.totalRetries += retryableEntries.length;
      setTimeout(
        async () => {
          for (const entry of retryableEntries) {
            entry._retryCount = (entry._retryCount || 0) + 1;
            await this.addToBatch(entry);
          }
        },
        1000 * Math.pow(2, retryableEntries[0]._retryCount || 0),
      );
    }

    const failedEntries = entries.filter(
      entry => (entry._retryCount || 0) >= maxRetries,
    );
    if (failedEntries.length > 0) {
      this.logger.error(
        `${failedEntries.length} entries permanently failed for ${collectionName}`,
      );
    }
  }

  private estimateEntrySize(entry: BatchLogEntry): number {
    return JSON.stringify(entry).length * 2;
  }

  private shouldFlushDueToMemory(): boolean {
    const totalMemory = Array.from(this.batches.values()).reduce(
      (sum, batch) => sum + batch.memorySize,
      0,
    );
    return totalMemory >= this.maxMemoryUsage;
  }

  async flushAll(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const collection of this.batches.keys()) {
      promises.push(this.flushCollection(collection));
    }

    await Promise.allSettled(promises);
  }

  async onModuleDestroy(): Promise<void> {
    this.isShuttingDown = true;

    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    await this.flushAll();
    this.logger.log('BatchManager shutdown complete');
  }
}
