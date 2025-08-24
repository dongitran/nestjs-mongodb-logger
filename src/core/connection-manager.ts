import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { MongoClient, Db } from 'mongodb';
import { MongoLoggerConfig } from '../interfaces/mongo-logger-config.interface';

const MONGO_LOGGER_CONFIG = 'MONGO_LOGGER_CONFIG';

enum ConnectionStatus {
  DISCONNECTED,
  CONNECTING,
  CONNECTED,
  RECONNECTING,
}

@Injectable()
export class ConnectionManager implements OnModuleDestroy {
  private readonly logger = new Logger(ConnectionManager.name);
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private status = ConnectionStatus.DISCONNECTED;
  private reconnectAttempts = 0;

  private metrics = {
    connectionSuccesses: 0,
    connectionFailures: 0,
    reconnects: 0,
    lastConnectionTime: null as Date | null,
    lastDisconnectTime: null as Date | null,
  };

  constructor(
    @Inject(MONGO_LOGGER_CONFIG) private readonly config: MongoLoggerConfig,
  ) {}

  async getDatabase(): Promise<Db> {
    if (this.db && this.status === ConnectionStatus.CONNECTED) {
      return this.db;
    }

    if (
      this.status === ConnectionStatus.CONNECTING ||
      this.status === ConnectionStatus.RECONNECTING
    ) {
      return this.waitForConnection();
    }

    return this.connect();
  }

  public isConnected(): boolean {
    return this.status === ConnectionStatus.CONNECTED;
  }

  public getMetrics(): object {
    return {
      ...this.metrics,
      status: ConnectionStatus[this.status],
    };
  }

  public async healthCheck(): Promise<{
    status: 'up' | 'down';
    error?: string;
  }> {
    if (!this.client || !this.isConnected()) {
      return { status: 'down', error: 'Client not connected' };
    }
    try {
      await this.db?.admin().ping();
      return { status: 'up' };
    } catch (error: unknown) {
      this.logger.error('Health check failed', error);
      return { status: 'down', error: (error as Error).message };
    }
  }

  private async connect(): Promise<Db> {
    if (this.status === ConnectionStatus.CONNECTING)
      return this.waitForConnection();

    this.status = ConnectionStatus.CONNECTING;

    try {
      const options = {
        maxPoolSize: 10,
        minPoolSize: 2,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        ...this.config.connectionOptions,
      };

      this.client = new MongoClient(this.config.uri, options);
      await this.client.connect();

      const dbName = this.extractDatabaseName(this.config.uri);
      this.db = this.client.db(dbName);

      this.setupEventHandlers();
      this.reconnectAttempts = 0;
      this.status = ConnectionStatus.CONNECTED;

      this.metrics.connectionSuccesses++;
      this.metrics.lastConnectionTime = new Date();

      this.logger.log('Successfully connected to MongoDB');
      return this.db;
    } catch (error) {
      this.status = ConnectionStatus.DISCONNECTED;
      this.metrics.connectionFailures++;
      this.logger.error('Failed to connect to MongoDB', error);
      throw error;
    }
  }

  private async waitForConnection(): Promise<Db> {
    return new Promise((resolve, reject) => {
      const checkConnection = (): void => {
        if (this.status === ConnectionStatus.CONNECTED && this.db) {
          resolve(this.db);
        } else if (this.status === ConnectionStatus.DISCONNECTED) {
          reject(new Error('Connection failed'));
        } else {
          setTimeout(checkConnection, 100);
        }
      };
      checkConnection();
    });
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('close', () => {
      this.status = ConnectionStatus.DISCONNECTED;
      this.metrics.lastDisconnectTime = new Date();
      this.logger.warn('MongoDB connection closed');
      this.handleReconnection();
    });

    this.client.on('error', error => {
      this.logger.error('MongoDB connection error', error);
    });

    this.client.on('serverHeartbeatFailed', () => {
      this.logger.warn('MongoDB heartbeat failed');
    });
  }

  private async handleReconnection(): Promise<void> {
    if (this.status !== ConnectionStatus.DISCONNECTED) return;

    const maxRetries = this.config.retryAttempts || 5;
    const baseDelay = this.config.retryDelay || 1000;

    if (this.reconnectAttempts >= maxRetries) {
      this.logger.error('Max reconnection attempts reached');
      return;
    }

    this.status = ConnectionStatus.RECONNECTING;
    this.reconnectAttempts++;
    this.metrics.reconnects++;
    const delay = baseDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.logger.log(
      `Attempting reconnection ${this.reconnectAttempts}/${maxRetries} in ${delay}ms`,
    );

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        this.logger.error('Reconnection failed', error);
        this.status = ConnectionStatus.DISCONNECTED;
      }
    }, delay);
  }

  private extractDatabaseName(uri: string): string {
    const match = uri.match(/\/([^/?]+)(\?|$)/);
    return match ? match[1] : 'logs';
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.status = ConnectionStatus.DISCONNECTED;
      this.logger.log('MongoDB connection closed');
    }
  }
}
