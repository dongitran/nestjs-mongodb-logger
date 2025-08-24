import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongoLoggerModule } from 'nestjs-mongodb-logger-core';

@Module({
  imports: [
    ConfigModule.forRoot(),
    MongoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI') as string,
        defaultCollection: 'logs',
        batchSize: 10,
        flushInterval: 1000,
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
