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
  private readonly flushingCollections = new Set<string>();

  private readonly batchSize: number;
  private readonly flushInterval: number;
  private readonly maxMemoryUsage: number;
  private readonly retries = new Map<string, number>();

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
    if (this.connectionManager.isCircuitOpen()) {
      this.logger.warn(
        `Skipping flush for ${collectionName}: Circuit Breaker is open.`,
      );
      return;
    }

    if (this.flushingCollections.has(collectionName)) {
      this.logger.debug(`Flush for ${collectionName} already in progress.`);
      return;
    }

    const batchToFlush = this.batches.get(collectionName);
    if (!batchToFlush || batchToFlush.entries.length === 0) {
      return;
    }

    // Atomic Swap: Replace the current batch with a new empty one immediately.
    this.batches.set(collectionName, {
      entries: [],
      lastFlush: Date.now(),
      memorySize: 0,
    });

    this.flushingCollections.add(collectionName);

    try {
      const db = await this.connectionManager.getDatabase();
      const collection = db.collection(collectionName);

      const cleanEntries = batchToFlush.entries.map(entry => {
        const { _batchId: _, _retryCount: __, ...cleanEntry } = entry;
        return cleanEntry;
      });

      await collection.insertMany(cleanEntries, { ordered: false });

      this.metrics.totalBatchesFlushed++;
      this.metrics.lastFlushTime = new Date();
      this.logger.debug(
        `Flushed ${batchToFlush.entries.length} entries to ${collectionName}`,
      );
      this.retries.delete(collectionName);
    } catch (error) {
      this.metrics.totalFlushFailures++;
      await this.handleFlushError(collectionName, batchToFlush.entries, error);
    } finally {
      this.flushingCollections.delete(collectionName);
    }
  }

  private async handleFlushError(
    collectionName: string,
    failedEntries: BatchLogEntry[],
    error: unknown,
  ): Promise<void> {
    this.logger.error(`Failed to flush batch to ${collectionName}`, error);

    const bulkError = error as {
      name?: string;
      writeErrors?: { index: number }[];
    };
    if (
      bulkError.name === 'BulkWriteError' &&
      Array.isArray(bulkError.writeErrors)
    ) {
      const failedIndexes = new Set(
        bulkError.writeErrors.map((e: { index: number }) => e.index),
      );
      const dlqEntries = failedEntries
        .filter((_, index) => failedIndexes.has(index))
        .map(failedLog => ({
          originalLog: failedLog,
          errorDetails: {
            message: 'Bulk write operation failed for this log entry.',
          },
          failedAt: new Date(),
          sourceCollection: collectionName,
        }));

      if (dlqEntries.length > 0) {
        await this.sendToDlq(collectionName, dlqEntries);
      }
    } else {
      const currentRetries = this.retries.get(collectionName) || 0;
      this.retries.set(collectionName, currentRetries + 1);
      this.metrics.totalRetries++;

      const liveBatch = this.batches.get(collectionName);
      if (liveBatch) {
        liveBatch.entries.unshift(...failedEntries);
        liveBatch.memorySize +=
          failedEntries.reduce(
            (sum, entry) => sum + this.estimateEntrySize(entry),
            0,
          ) || 0;
      }

      this.logger.warn(
        `Retrying flush for ${collectionName}. Attempt ${currentRetries + 1}`,
      );
    }
  }

  private async sendToDlq(
    collectionName: string,
    dlqEntries: object[],
  ): Promise<void> {
    try {
      const db = await this.connectionManager.getDatabase();
      const dlqCollection = db.collection(`${collectionName}_dlq`);
      await dlqCollection.insertMany(dlqEntries, { ordered: false });
    } catch (dlqError) {
      this.logger.error(
        `CRITICAL: Failed to write to DLQ for ${collectionName}`,
        dlqError,
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
