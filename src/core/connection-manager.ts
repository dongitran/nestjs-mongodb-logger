import { Injectable, Inject, Logger, OnModuleDestroy } from '@nestjs/common';
import { MongoClient, Db } from 'mongodb';
import { MongoLoggerConfig } from '../interfaces/mongo-logger-config.interface';

const MONGO_LOGGER_CONFIG = 'MONGO_LOGGER_CONFIG';

enum CircuitBreakerState {
  CLOSED,
  OPEN,
  HALF_OPEN,
}

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

  private circuitState = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime: number | null = null;
  private readonly failureThreshold = 5;
  private readonly openDuration = 30000;

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

  public isCircuitOpen(): boolean {
    return this.circuitState === CircuitBreakerState.OPEN;
  }

  async getDatabase(): Promise<Db> {
    if (this.circuitState === CircuitBreakerState.OPEN) {
      if (Date.now() - (this.lastFailureTime || 0) > this.openDuration) {
        this.logger.warn(
          'Circuit Breaker is now HALF-OPEN. Permitting a trial connection.',
        );
        this.circuitState = CircuitBreakerState.HALF_OPEN;
      } else {
        throw new Error('Circuit Breaker is open. Database is unavailable.');
      }
    }

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
      this.handleConnectionSuccess();
      return this.db;
    } catch (error) {
      this.handleConnectionFailure(error);
      throw error;
    }
  }

  private handleConnectionSuccess(): void {
    this.logger.log('Connection successful. Circuit Breaker is CLOSED.');
    this.circuitState = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.status = ConnectionStatus.CONNECTED;
    this.metrics.connectionSuccesses++;
    this.metrics.lastConnectionTime = new Date();
  }

  private handleConnectionFailure(error: unknown): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    this.status = ConnectionStatus.DISCONNECTED;
    this.metrics.connectionFailures++;
    this.logger.error(
      `Connection failed (Attempt ${this.failureCount}/${this.failureThreshold})`,
      error,
    );

    if (this.circuitState === CircuitBreakerState.HALF_OPEN) {
      this.logger.error(
        'Trial connection failed. Circuit Breaker is OPEN again.',
      );
      this.circuitState = CircuitBreakerState.OPEN;
    } else if (this.failureCount >= this.failureThreshold) {
      this.logger.error('Failure threshold reached. Opening Circuit Breaker.');
      this.circuitState = CircuitBreakerState.OPEN;
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
    this.logger.warn(
      'Connection lost. Circuit Breaker will manage reconnection attempts.',
    );
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
