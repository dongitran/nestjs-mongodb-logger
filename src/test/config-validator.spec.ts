import { ConfigValidator } from '../utils/config-validator';
import { MongoLoggerConfig } from '../interfaces/mongo-logger-config.interface';

describe('ConfigValidator', () => {
  describe('validate', () => {
    it('should validate valid configuration', () => {
      const config: MongoLoggerConfig = {
        uri: 'mongodb://localhost:27017/test',
        batchSize: 500,
        flushInterval: 5000,
        maxMemoryUsage: 100,
        retryAttempts: 5,
        retryDelay: 1000,
        enableMetrics: true,
        logLevel: 'info',
        gracefulShutdownTimeout: 30000,
      };

      const result = ConfigValidator.validate(config);
      expect(result).toBeDefined();
      expect(result.uri).toBe(config.uri);
    });

    it('should apply defaults for missing optional properties', () => {
      const config: MongoLoggerConfig = {
        uri: 'mongodb://localhost:27017/test',
      };

      const result = ConfigValidator.validate(config);
      expect(result.defaultCollection).toBe('logs');
      expect(result.batchSize).toBe(500);
      expect(result.flushInterval).toBe(5000);
      expect(result.enableMetrics).toBe(true);
    });

    it('should throw error for invalid batch size', () => {
      const config = {
        uri: 'mongodb://localhost:27017/test',
        batchSize: 0,
      };

      expect(() => ConfigValidator.validate(config as MongoLoggerConfig)).toThrow();
    });

    it('should throw error for invalid flush interval', () => {
      const config = {
        uri: 'mongodb://localhost:27017/test',
        flushInterval: 50,
      };

      expect(() => ConfigValidator.validate(config as MongoLoggerConfig)).toThrow();
    });

    it('should throw error for invalid retry attempts', () => {
      const config = {
        uri: 'mongodb://localhost:27017/test',
        retryAttempts: 25,
      };

      expect(() => ConfigValidator.validate(config as MongoLoggerConfig)).toThrow();
    });
  });

  describe('validateUri', () => {
    it('should validate valid MongoDB URI', () => {
      expect(() => ConfigValidator.validateUri('mongodb://localhost:27017/test')).not.toThrow();
      expect(() => ConfigValidator.validateUri('mongodb+srv://cluster.mongodb.net/test')).not.toThrow();
    });

    it('should throw error for empty URI', () => {
      expect(() => ConfigValidator.validateUri('')).toThrow('MongoDB URI is required');
    });

    it('should throw error for invalid URI format', () => {
      expect(() => ConfigValidator.validateUri('invalid-uri')).toThrow('Invalid MongoDB URI format');
      expect(() => ConfigValidator.validateUri('http://localhost:27017/test')).toThrow('Invalid MongoDB URI format');
    });

    it('should throw error for malformed URI', () => {
      expect(() => ConfigValidator.validateUri('mongodb://[invalid')).toThrow('Invalid MongoDB URI format');
    });
  });

  describe('getEnvironmentConfig', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should read configuration from environment variables', () => {
      process.env.MONGODB_LOGGER_URI = 'mongodb://localhost:27017/env-test';
      process.env.MONGODB_LOGGER_BATCH_SIZE = '1000';
      process.env.MONGODB_LOGGER_ENABLE_METRICS = 'true';
      process.env.MONGODB_LOGGER_LOG_LEVEL = 'error';

      const config = ConfigValidator.getEnvironmentConfig();

      expect(config.uri).toBe('mongodb://localhost:27017/env-test');
      expect(config.batchSize).toBe(1000);
      expect(config.enableMetrics).toBe(true);
      expect(config.logLevel).toBe('error');
    });

    it('should handle missing environment variables', () => {
      const config = ConfigValidator.getEnvironmentConfig();

      expect(config.uri).toBeUndefined();
      expect(config.batchSize).toBeUndefined();
      expect(config.enableMetrics).toBe(false);
    });

    it('should parse numeric environment variables', () => {
      process.env.MONGODB_LOGGER_BATCH_SIZE = '750';
      process.env.MONGODB_LOGGER_FLUSH_INTERVAL = '3000';
      process.env.MONGODB_LOGGER_MAX_MEMORY = '150';

      const config = ConfigValidator.getEnvironmentConfig();

      expect(config.batchSize).toBe(750);
      expect(config.flushInterval).toBe(3000);
      expect(config.maxMemoryUsage).toBe(150);
    });
  });
});
