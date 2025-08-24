import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  validateSync,
} from 'class-validator';
import { Transform, plainToClass } from 'class-transformer';
import { MongoLoggerConfig } from '../interfaces/mongo-logger-config.interface';

export class MongoLoggerConfigDto {
  @IsString()
  uri!: string;

  @IsOptional()
  @IsString()
  defaultCollection?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(10000)
  @Transform(({ value }) => parseInt(value, 10))
  batchSize?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(300000)
  @Transform(({ value }) => parseInt(value, 10))
  flushInterval?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(1000)
  @Transform(({ value }) => parseInt(value, 10))
  maxMemoryUsage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(20)
  @Transform(({ value }) => parseInt(value, 10))
  retryAttempts?: number;

  @IsOptional()
  @IsNumber()
  @Min(100)
  @Max(60000)
  @Transform(({ value }) => parseInt(value, 10))
  retryDelay?: number;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  enableMetrics?: boolean;

  @IsOptional()
  @IsString()
  logLevel?: 'error' | 'warn' | 'info';

  @IsOptional()
  @IsNumber()
  @Min(1000)
  @Max(60000)
  @Transform(({ value }) => parseInt(value, 10))
  gracefulShutdownTimeout?: number;
}

export class ConfigValidator {
  static validate(config: MongoLoggerConfig): MongoLoggerConfig {
    const configDto = plainToClass(MongoLoggerConfigDto, config);
    const errors = validateSync(configDto);

    if (errors.length > 0) {
      const errorMessages = errors
        .map(error => Object.values(error.constraints || {}).join(', '))
        .join('; ');
      throw new Error(
        `MongoDB Logger configuration validation failed: ${errorMessages}`,
      );
    }

    return this.applyDefaults(configDto);
  }

  private static applyDefaults(
    config: MongoLoggerConfigDto,
  ): MongoLoggerConfig {
    return {
      ...config,
      defaultCollection: config.defaultCollection || 'logs',
      batchSize: config.batchSize || 500,
      flushInterval: config.flushInterval || 5000,
      maxMemoryUsage: config.maxMemoryUsage || 100,
      retryAttempts: config.retryAttempts || 5,
      retryDelay: config.retryDelay || 1000,
      enableMetrics:
        config.enableMetrics !== undefined ? config.enableMetrics : true,
      logLevel: config.logLevel || 'info',
      gracefulShutdownTimeout: config.gracefulShutdownTimeout || 30000,
    };
  }

  static validateUri(uri: string): void {
    if (!uri) {
      throw new Error('MongoDB URI is required');
    }

    if (!uri.startsWith('mongodb://') && !uri.startsWith('mongodb+srv://')) {
      throw new Error('Invalid MongoDB URI format');
    }

    try {
      new URL(uri);
    } catch {
      throw new Error('Invalid MongoDB URI format');
    }
  }

  static getEnvironmentConfig(): Partial<MongoLoggerConfig> {
    return {
      uri: process.env.MONGODB_LOGGER_URI,
      defaultCollection: process.env.MONGODB_LOGGER_DEFAULT_COLLECTION,
      batchSize: process.env.MONGODB_LOGGER_BATCH_SIZE
        ? parseInt(process.env.MONGODB_LOGGER_BATCH_SIZE, 10)
        : undefined,
      flushInterval: process.env.MONGODB_LOGGER_FLUSH_INTERVAL
        ? parseInt(process.env.MONGODB_LOGGER_FLUSH_INTERVAL, 10)
        : undefined,
      maxMemoryUsage: process.env.MONGODB_LOGGER_MAX_MEMORY
        ? parseInt(process.env.MONGODB_LOGGER_MAX_MEMORY, 10)
        : undefined,
      retryAttempts: process.env.MONGODB_LOGGER_RETRY_ATTEMPTS
        ? parseInt(process.env.MONGODB_LOGGER_RETRY_ATTEMPTS, 10)
        : undefined,
      retryDelay: process.env.MONGODB_LOGGER_RETRY_DELAY
        ? parseInt(process.env.MONGODB_LOGGER_RETRY_DELAY, 10)
        : undefined,
      enableMetrics: process.env.MONGODB_LOGGER_ENABLE_METRICS === 'true',
      logLevel:
        (process.env.MONGODB_LOGGER_LOG_LEVEL as 'error' | 'warn' | 'info') ||
        undefined,
      gracefulShutdownTimeout: process.env.MONGODB_LOGGER_SHUTDOWN_TIMEOUT
        ? parseInt(process.env.MONGODB_LOGGER_SHUTDOWN_TIMEOUT, 10)
        : undefined,
    };
  }
}
