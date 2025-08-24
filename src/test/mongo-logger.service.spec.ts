import { Test, TestingModule } from '@nestjs/testing';
import { MongoLoggerService } from '../core/mongo-logger.service';
import { BatchManager } from '../core/batch-manager';
import { MongoLoggerConfig } from '../interfaces/mongo-logger-config.interface';

describe('MongoLoggerService', () => {
  let service: MongoLoggerService;
  let batchManager: jest.Mocked<BatchManager>;

  const mockConfig: MongoLoggerConfig = {
    uri: 'mongodb://localhost:27017/test',
    defaultCollection: 'test-logs',
    batchSize: 100,
    flushInterval: 1000,
    maxMemoryUsage: 50,
    retryDelay: 500,
    enableMetrics: true,
    logLevel: 'info',
    gracefulShutdownTimeout: 5000,
  };

  beforeEach(async () => {
    const mockBatchManager = {
      addToBatch: jest.fn(),
      flushAll: jest.fn(),
      getMetrics: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MongoLoggerService,
        {
          provide: 'MONGO_LOGGER_CONFIG',
          useValue: mockConfig,
        },
        {
          provide: BatchManager,
          useValue: mockBatchManager,
        },
      ],
    }).compile();

    service = module.get<MongoLoggerService>(MongoLoggerService);
    batchManager = module.get(BatchManager);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('should add log entry to batch with timestamp', async () => {
      const logEntry = {
        level: 'info',
        message: 'Test message',
        metadata: { userId: '123' },
      };

      await service.log('test-collection', logEntry);

      expect(batchManager.addToBatch).toHaveBeenCalledWith({
        ...logEntry,
        timestamp: expect.any(Date),
        collection: 'test-collection',
      });
    });

    it('should handle log entry without metadata', async () => {
      const logEntry = {
        level: 'error',
        message: 'Error message',
      };

      await service.log('error-logs', logEntry);

      expect(batchManager.addToBatch).toHaveBeenCalledWith({
        ...logEntry,
        timestamp: expect.any(Date),
        collection: 'error-logs',
      });
    });
  });

  describe('logError', () => {
    it('should log error with stack trace', async () => {
      const error = new Error('Test error');
      const metadata = { context: 'test' };

      await service.logError('error-logs', error, metadata);

      expect(batchManager.addToBatch).toHaveBeenCalledWith({
        timestamp: expect.any(Date),
        level: 'error',
        message: 'Test error',
        stack: error.stack,
        metadata,
        collection: 'error-logs',
      });
    });

    it('should log error without metadata', async () => {
      const error = new Error('Test error');

      await service.logError('error-logs', error);

      expect(batchManager.addToBatch).toHaveBeenCalledWith({
        timestamp: expect.any(Date),
        level: 'error',
        message: 'Test error',
        stack: error.stack,
        metadata: undefined,
        collection: 'error-logs',
      });
    });
  });

  describe('flush', () => {
    it('should call batchManager flushAll', async () => {
      await service.flush();
      expect(batchManager.flushAll).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should flush all batches on module destroy', async () => {
      await service.onModuleDestroy();
      expect(batchManager.flushAll).toHaveBeenCalled();
    });
  });
});
