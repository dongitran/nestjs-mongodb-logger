import { Test, TestingModule } from '@nestjs/testing';
import { BatchManager } from '../core/batch-manager';
import { ConnectionManager } from '../core/connection-manager';
import { MongoLoggerConfig } from '../interfaces/mongo-logger-config.interface';
import { LogEntry } from '../interfaces/log-entry.interface';

describe('BatchManager', () => {
  let batchManager: BatchManager;
  let connectionManager: jest.Mocked<ConnectionManager>;

  const mockConfig: MongoLoggerConfig = {
    uri: 'mongodb://localhost:27017/test',
    batchSize: 3,
    flushInterval: 100,
    maxMemoryUsage: 1,
    retryDelay: 100,
  };

  const mockDb = {
    collection: jest.fn().mockReturnValue({
      insertMany: jest.fn().mockResolvedValue({}),
      insertOne: jest.fn().mockResolvedValue({}),
    }),
  } as any; // Cast to any to satisfy TypeScript in mock environment

  beforeEach(async () => {
    const mockConnectionManager = {
      getDatabase: jest.fn().mockResolvedValue(mockDb),
      isConnected: jest.fn().mockReturnValue(true),
      isCircuitOpen: jest.fn().mockReturnValue(false),
      getMetrics: jest.fn().mockReturnValue({}),
      healthCheck: jest.fn().mockResolvedValue({ status: 'up' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BatchManager,
        {
          provide: 'MONGO_LOGGER_CONFIG',
          useValue: mockConfig,
        },
        {
          provide: ConnectionManager,
          useValue: mockConnectionManager,
        },
      ],
    }).compile();

    batchManager = module.get<BatchManager>(BatchManager);
    connectionManager = module.get(ConnectionManager);

    jest.clearAllMocks();
  });

  afterEach(async () => {
    await batchManager.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(batchManager).toBeDefined();
  });

  describe('addToBatch', () => {
    it('should add entry to batch', async () => {
      const logEntry: LogEntry = {
        timestamp: new Date(),
        level: 'info',
        message: 'Test message',
        collection: 'test-logs',
      };

      await batchManager.addToBatch(logEntry);

      const metrics = batchManager.getMetrics();
      expect(metrics.totalEntriesProcessed).toBe(1);
    });

    it('should flush when batch size is reached', async () => {
      const logEntries: LogEntry[] = [
        {
          timestamp: new Date(),
          message: 'Message 1',
          collection: 'test-logs',
        },
        {
          timestamp: new Date(),
          message: 'Message 2',
          collection: 'test-logs',
        },
        {
          timestamp: new Date(),
          message: 'Message 3',
          collection: 'test-logs',
        },
      ];

      for (const entry of logEntries) {
        await batchManager.addToBatch(entry);
      }

      expect(connectionManager.getDatabase).toHaveBeenCalled();
      expect(mockDb.collection).toHaveBeenCalledWith('test-logs');
    });

    it('should use default collection when not specified', async () => {
      const logEntry: LogEntry = {
        timestamp: new Date(),
        message: 'Test message',
      };

      await batchManager.addToBatch(logEntry);
      await batchManager.flushAll();

      expect(mockDb.collection).toHaveBeenCalledWith('logs');
    });
  });

  describe('flushAll', () => {
    it('should flush all collections', async () => {
      const entries = [
        { timestamp: new Date(), message: 'Message 1', collection: 'logs1' },
        { timestamp: new Date(), message: 'Message 2', collection: 'logs2' },
      ];

      for (const entry of entries) {
        await batchManager.addToBatch(entry);
      }

      await batchManager.flushAll();

      expect(mockDb.collection).toHaveBeenCalledWith('logs1');
      expect(mockDb.collection).toHaveBeenCalledWith('logs2');
    });
  });

  describe('getMetrics', () => {
    it('should return batch metrics', async () => {
      const logEntry: LogEntry = {
        timestamp: new Date(),
        message: 'Test message',
        collection: 'test-logs',
      };

      await batchManager.addToBatch(logEntry);

      const metrics = batchManager.getMetrics();
      expect(metrics).toHaveProperty('totalEntriesProcessed');
      expect(metrics).toHaveProperty('totalBatchesFlushed');
      expect(metrics).toHaveProperty('currentMemoryUsage');
      expect(metrics).toHaveProperty('collectionsActive');
      expect(metrics.totalEntriesProcessed).toBe(1);
    });
  });

  describe('error handling', () => {
    it('should handle database connection errors', async () => {
      connectionManager.getDatabase.mockRejectedValueOnce(
        new Error('Connection failed'),
      );

      const logEntry: LogEntry = {
        timestamp: new Date(),
        message: 'Test message',
        collection: 'test-logs',
      };

      await batchManager.addToBatch(logEntry);
      await batchManager.flushAll();

      const metrics = batchManager.getMetrics();
      expect(metrics.totalFlushFailures).toBeGreaterThan(0);
    });

    it('should retry failed batches', async () => {
      const insertManyMock = mockDb.collection().insertMany;
      insertManyMock.mockClear(); // Reset the mock

      // First call fails with a retriable error, second call succeeds
      insertManyMock
        .mockRejectedValueOnce({ name: 'MongoTransientTransactionError' })
        .mockResolvedValueOnce({});

      // Ensure getDatabase mock is clean for this test
      connectionManager.getDatabase.mockResolvedValue(mockDb);

      const logEntry: LogEntry = {
        timestamp: new Date(),
        message: 'Test message',
        collection: 'test-logs',
      };

      await batchManager.addToBatch(logEntry);
      await batchManager.flushAll(); // First flush attempt, fails and schedules retry

      // We need to wait for the retry logic to execute
      await new Promise(resolve => setTimeout(resolve, 200)); // Wait for retry delay
      await batchManager.flushAll(); // Second flush attempt, should succeed

      const metrics = batchManager.getMetrics();
      expect(insertManyMock).toHaveBeenCalledTimes(2);
      expect(metrics.totalRetries).toBe(1);
    });
  });
});
