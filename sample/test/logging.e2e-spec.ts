import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';
import { MongoClient } from 'mongodb';

describe('Logging (e2e)', () => {
  let app: INestApplication;
  let mongoClient: MongoClient;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI environment variable not set');
    }
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
  }, 30000);

  afterAll(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
    if (app) {
      await app.close();
    }
  }, 30000);

  const waitForLogs = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  it('/info (POST)', async () => {
    const message = `Test info log ${Date.now()}`;
    await request(app.getHttpServer())
      .post('/info')
      .send({ message })
      .expect(201);

    await waitForLogs(3000);

    const db = mongoClient.db('nestjs-mongodb-logger-test');
    const log = await db.collection('info-logs').findOne({ message });
    expect(log).toBeDefined();
    expect(log.level).toBe('info');
  });

  it('/error (POST)', async () => {
    const message = `Test error log ${Date.now()}`;
    await request(app.getHttpServer())
      .post('/error')
      .send({ message })
      .expect(201);

    await waitForLogs(3000);

    const db = mongoClient.db('nestjs-mongodb-logger-test');
    const log = await db.collection('error-logs').findOne({ message });
    expect(log).toBeDefined();
    expect(log.level).toBe('error');
    expect(log.stack).toBeDefined();
  });

  it('/metadata (POST)', async () => {
    const metadata = {
      userId: '123',
      context: 'e2e-test',
      timestamp: Date.now(),
    };
    await request(app.getHttpServer())
      .post('/metadata')
      .send(metadata)
      .expect(201);

    await waitForLogs(3000);

    const db = mongoClient.db('nestjs-mongodb-logger-test');
    const log = await db
      .collection('metadata-logs')
      .findOne({ 'metadata.userId': '123' });
    expect(log).toBeDefined();
    expect(log.metadata.context).toBe('e2e-test');
  });

  it('/batch (POST)', async () => {
    await request(app.getHttpServer()).post('/batch').expect(201);

    await waitForLogs(3000);

    const db = mongoClient.db('nestjs-mongodb-logger-test');
    const logs = await db.collection('batch-logs').find({}).toArray();
    expect(logs.length).toBeGreaterThanOrEqual(10);
  });

  it('should handle a high volume of logs without loss', async () => {
    const LOG_VOLUME = 500;
    const collectionName = 'stress-test-logs';
    const db = mongoClient.db('nestjs-mongodb-logger-test');

    // Clear collection before test
    await db.collection(collectionName).deleteMany({});

    // Trigger the stress test endpoint
    await request(app.getHttpServer()).post('/stress').expect(201);

    // Wait for a period to allow the batch manager to flush all logs
    await new Promise((resolve) => setTimeout(resolve, 6000));

    const logCount = await db.collection(collectionName).countDocuments();
    expect(logCount).toBe(LOG_VOLUME);
  }, 20000); // Increase timeout for this test
});
