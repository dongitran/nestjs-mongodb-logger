import { DynamicModule, Module, Provider } from '@nestjs/common';
import {
  MongoLoggerConfig,
  MongoLoggerAsyncConfig,
} from '../interfaces/mongo-logger-config.interface';
import { MongoLoggerService } from './mongo-logger.service';
import { ConnectionManager } from './connection-manager';
import { BatchManager } from './batch-manager';
import { HealthCheckService } from '../utils/health-check.service';

const MONGO_LOGGER_CONFIG = 'MONGO_LOGGER_CONFIG';

@Module({})
export class MongoLoggerModule {
  static forRoot(config: MongoLoggerConfig): DynamicModule {
    const configProvider: Provider = {
      provide: MONGO_LOGGER_CONFIG,
      useValue: config,
    };

    return {
      module: MongoLoggerModule,
      providers: [
        configProvider,
        ConnectionManager,
        BatchManager,
        MongoLoggerService,
        HealthCheckService,
      ],
      exports: [MongoLoggerService, HealthCheckService],
      global: true,
    };
  }

  static forRootAsync(options: MongoLoggerAsyncConfig): DynamicModule {
    const configProvider: Provider = {
      provide: MONGO_LOGGER_CONFIG,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };

    return {
      module: MongoLoggerModule,
      imports: options.imports || [],
      providers: [
        configProvider,
        ConnectionManager,
        BatchManager,
        MongoLoggerService,
      ],
      exports: [MongoLoggerService],
      global: true,
    };
  }
}
