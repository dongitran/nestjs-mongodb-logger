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
}
