import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongoLoggerService } from 'nestjs-mongodb-logger';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: MongoLoggerService,
          useValue: { log: jest.fn(), logInfo: jest.fn() },
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('logInfo', () => {
    it('should return "Info log sent"', async () => {
      expect(await appController.logInfo('test')).toBe('Info log sent');
    });
  });
});
