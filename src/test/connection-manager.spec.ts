import { Test, TestingModule } from '@nestjs/testing';
import { ConnectionManager } from '../core/connection-manager';
import { MongoLoggerConfig } from '../interfaces/mongo-logger-config.interface';

const mockClient = {
  connect: jest.fn(),
  close: jest.fn(),
  db: jest.fn().mockReturnValue({
    admin: jest.fn().mockReturnValue({
      ping: jest.fn().mockResolvedValue({}),
    }),
  }),
  on: jest.fn(),
};

jest.mock('mongodb', () => ({
  MongoClient: jest.fn().mockImplementation(() => mockClient),
}));

describe('ConnectionManager', () => {
  let connectionManager: ConnectionManager;

  const mockConfig: MongoLoggerConfig = {
    uri: 'mongodb://localhost:27017/test',
    retryDelay: 1000,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConnectionManager,
        {
          provide: 'MONGO_LOGGER_CONFIG',
          useValue: mockConfig,
        },
      ],
    }).compile();

    connectionManager = module.get<ConnectionManager>(ConnectionManager);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await connectionManager.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(connectionManager).toBeDefined();
  });

  describe('getDatabase', () => {
    it('should connect and return database', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);

      const db = await connectionManager.getDatabase();

      expect(mockClient.connect).toHaveBeenCalled();
      expect(db).toBeDefined();
    });

    it('should return existing database if already connected', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);

      await connectionManager.getDatabase();
      await connectionManager.getDatabase();

      expect(mockClient.connect).toHaveBeenCalledTimes(1);
    });

    it('should handle connection errors', async () => {
      mockClient.connect.mockRejectedValueOnce(new Error('Connection failed'));

      await expect(connectionManager.getDatabase()).rejects.toThrow(
        'Connection failed',
      );
    });
  });

  describe('isConnected', () => {
    it('should return false initially', () => {
      expect(connectionManager.isConnected()).toBe(false);
    });

    it('should return true after successful connection', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);

      await connectionManager.getDatabase();

      expect(connectionManager.isConnected()).toBe(true);
    });
  });

  describe('healthCheck', () => {
    it('should return up status when connected and ping succeeds', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);

      await connectionManager.getDatabase();
      const health = await connectionManager.healthCheck();

      expect(health.status).toBe('up');
    });

    it('should return down status when not connected', async () => {
      const health = await connectionManager.healthCheck();

      expect(health.status).toBe('down');
      expect(health.error).toBe('Client not connected');
    });

    it('should return down status when ping fails', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);
      mockClient
        .db()
        .admin()
        .ping.mockRejectedValueOnce(new Error('Ping failed'));

      await connectionManager.getDatabase();
      const health = await connectionManager.healthCheck();

      expect(health.status).toBe('down');
      expect(health.error).toBe('Ping failed');
    });
  });

  describe('getMetrics', () => {
    it('should return connection metrics', async () => {
      const metrics = connectionManager.getMetrics();

      expect(metrics).toHaveProperty('status');
      expect(metrics).toHaveProperty('connectionSuccesses');
      expect(metrics).toHaveProperty('connectionFailures');
    });
  });

  describe('onModuleDestroy', () => {
    it('should close connection on destroy', async () => {
      mockClient.connect.mockResolvedValueOnce(undefined);

      await connectionManager.getDatabase();
      await connectionManager.onModuleDestroy();

      expect(mockClient.close).toHaveBeenCalled();
    });
  });
});
