import { Injectable } from '@nestjs/common';
import { MongoLoggerService } from 'nestjs-mongodb-logger';

@Injectable()
export class AppService {
  constructor(private readonly logger: MongoLoggerService) {}

  async logInfo(message: string): Promise<void> {
    await this.logger.log('info-logs', { level: 'info', message });
  }

  async logError(errorMessage: string): Promise<void> {
    try {
      throw new Error(errorMessage);
    } catch (error) {
      await this.logger.logError('error-logs', error as Error, {
        context: 'AppService',
      });
    }
  }

  async logWithMetadata(data: any): Promise<void> {
    await this.logger.log('metadata-logs', { metadata: data });
  }

  async triggerBatchFlush(): Promise<void> {
    const promises = [];
    for (let i = 0; i < 15; i++) {
      promises.push(
        this.logger.log('batch-logs', { message: `Batch message ${i + 1}` }),
      );
    }
    await Promise.all(promises);
  }
}
