import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { MongoLoggerService } from '../core/mongo-logger.service';
import { LOG_METADATA_KEY, LogDecoratorOptions } from './log.decorator';

@Injectable()
export class LogInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly mongoLogger: MongoLoggerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const logOptions = this.reflector.get<LogDecoratorOptions>(
      LOG_METADATA_KEY,
      context.getHandler(),
    );

    if (!logOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const startTime = Date.now();
    const methodName = context.getHandler().name;
    const className = context.getClass().name;

    const baseLogData: Record<string, unknown> = {
      method: methodName,
      class: className,
      level: logOptions.level || 'info',
      startTime: new Date(startTime),
    };

    if (logOptions.includeArgs && request) {
      baseLogData.requestData = this.sanitizeData(
        {
          url: request.url,
          method: request.method,
          headers: request.headers,
          body: request.body,
          query: request.query,
          params: request.params,
        },
        logOptions.excludeFields,
      );
    }

    return next.handle().pipe(
      tap(result => {
        const endTime = Date.now();
        const logData: Record<string, unknown> = {
          ...baseLogData,
          status: 'success',
          duration: endTime - startTime,
          endTime: new Date(endTime),
        };

        if (logOptions.includeResult) {
          logData.result = this.sanitizeData(result, logOptions.excludeFields);
        }

        this.mongoLogger.log(logOptions.collection || 'method-logs', logData);
      }),
      catchError(error => {
        const endTime = Date.now();
        const logData = {
          ...baseLogData,
          status: 'error',
          duration: endTime - startTime,
          endTime: new Date(endTime),
          error: {
            message: error.message,
            stack: error.stack,
            name: error.name,
          },
        };

        this.mongoLogger.log(logOptions.collection || 'method-logs', logData);

        throw error;
      }),
    );
  }

  private sanitizeData(data: unknown, excludeFields?: string[]): unknown {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const sanitized = { ...data } as Record<string, unknown>;

    if (excludeFields) {
      for (const field of excludeFields) {
        if (field in sanitized) {
          sanitized[field] = '[EXCLUDED]';
        }
      }
    }

    const sensitiveFields = [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
    ];
    for (const field of sensitiveFields) {
      if (field in sanitized) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }
}
