import { MongoLoggerConfig } from '../interfaces/mongo-logger-config.interface';
import { ConfigValidator } from './config-validator';
import { DEFAULT_ENVIRONMENT_CONFIG } from '../interfaces/environment-config.interface';

export class ConfigFactory {
  static createConfig(
    baseConfig: Partial<MongoLoggerConfig>,
    environment?: string,
  ): MongoLoggerConfig {
    const env = environment || process.env.NODE_ENV || 'development';
    const envConfig =
      DEFAULT_ENVIRONMENT_CONFIG[
        env as keyof typeof DEFAULT_ENVIRONMENT_CONFIG
      ] || DEFAULT_ENVIRONMENT_CONFIG.development;

    const environmentOverrides = ConfigValidator.getEnvironmentConfig();

    const mergedConfig = {
      ...envConfig,
      ...baseConfig,
      ...environmentOverrides,
    };

    if (!mergedConfig.uri) {
      throw new Error(
        'MongoDB URI must be provided either in config or environment variable MONGODB_LOGGER_URI',
      );
    }

    ConfigValidator.validateUri(mergedConfig.uri);
    return ConfigValidator.validate(mergedConfig as MongoLoggerConfig);
  }

  static createFromEnvironment(): MongoLoggerConfig {
    const envConfig = ConfigValidator.getEnvironmentConfig();
    return this.createConfig(envConfig);
  }

  static createForTesting(
    overrides: Partial<MongoLoggerConfig> = {},
  ): MongoLoggerConfig {
    const testConfig: Partial<MongoLoggerConfig> = {
      uri: 'mongodb://localhost:27017/test-logs',
      batchSize: 10,
      flushInterval: 100,
      maxMemoryUsage: 5,
      retryAttempts: 1,
      enableMetrics: false,
      logLevel: 'error',
      ...overrides,
    };

    return ConfigValidator.validate(testConfig as MongoLoggerConfig);
  }

  static createForProduction(
    uri: string,
    overrides: Partial<MongoLoggerConfig> = {},
  ): MongoLoggerConfig {
    const prodConfig: Partial<MongoLoggerConfig> = {
      uri,
      batchSize: 1000,
      flushInterval: 10000,
      maxMemoryUsage: 200,
      retryAttempts: 5,
      enableMetrics: true,
      logLevel: 'error',
      ...overrides,
    };

    return ConfigValidator.validate(prodConfig as MongoLoggerConfig);
  }
}
