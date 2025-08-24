# 🚀 NestJS MongoDB Logger

A production-ready MongoDB logging package for NestJS applications, featuring optimized batch processing and robust connection management.

## ✨ Features

- **🔌 Reliable Connection**: Auto-reconnects with exponential backoff and connection pooling.
- **⚡ Optimized Batching**: Logs are batched and flushed based on size or time intervals to reduce database load.
- **🧩 Seamless NestJS Integration**: Simple setup with `forRoot` and `forRootAsync`.
- **🩺 Health Monitoring**: Includes a `HealthCheckService` to monitor the connection and batch processing status.
- **🕵️ Automatic Logging**: Provides a `LogInterceptor` to automatically log method calls, arguments, and results.

## � Data Flow

```mermaid
graph TD
    A[Your Application] -->|Calls logger.log()| B(MongoLoggerService);
    B -->|Adds to queue| C{BatchManager};
    C -->|Flushes batch (on size/time)| D[ConnectionManager];
    D -->|Writes to DB| E((MongoDB));
```

## �📦 Installation

```bash
pnpm install nestjs-mongodb-logger-core
```

## 🚀 Quick Start

**1. Import the module:**

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MongoLoggerModule } from 'nestjs-mongodb-logger-core';

@Module({
  imports: [
    MongoLoggerModule.forRoot({
      uri: 'your-mongodb-connection-string',
      defaultCollection: 'app-logs',
      batchSize: 100,       // Optional: Default is 500
      flushInterval: 5000,  // Optional: Default is 5000ms
    }),
  ],
})
export class AppModule {}
```

**2. Inject and use the service:**

```typescript
// any.service.ts
import { Injectable } from '@nestjs/common';
import { MongoLoggerService } from 'nestjs-mongodb-logger-core';

@Injectable()
export class MyService {
  constructor(private readonly logger: MongoLoggerService) {}

  doSomething() {
    this.logger.log('my-logs', {
      level: 'info',
      message: 'User performed an action',
      metadata: { userId: '123', context: 'Billing' }
    });
  }

  handleError(error: Error) {
    this.logger.logError('error-logs', error, { context: 'MyService' });
  }
}
```

## ⚙️ Asynchronous Configuration

Use `forRootAsync` to configure the module with environment variables.

```typescript
// app.module.ts
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongoLoggerModule } from 'nestjs-mongodb-logger-core';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

## 👨‍💻 Author

dongtran ✨

---

Made with ❤️ to make your work life easier!