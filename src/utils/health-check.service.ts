import { Injectable } from '@nestjs/common';
import { ConnectionManager } from '../core/connection-manager';
import { BatchManager } from '../core/batch-manager';

export interface HealthStatus {
  status: 'up' | 'down' | 'degraded';
  timestamp: Date;
  details: {
    database: {
      status: 'up' | 'down';
      error?: string;
      metrics?: object;
    };
    batchProcessor: {
      status: 'up' | 'degraded';
      metrics?: object;
    };
  };
}

@Injectable()
export class HealthCheckService {
  constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly batchManager: BatchManager,
  ) {}

  async getHealthStatus(): Promise<HealthStatus> {
    const timestamp = new Date();
    const dbHealth = await this.connectionManager.healthCheck();
    const batchMetrics = this.batchManager.getMetrics();
    const connectionMetrics = this.connectionManager.getMetrics();

    const batchStatus = this.evaluateBatchHealth(batchMetrics);

    const overallStatus = this.determineOverallStatus(
      dbHealth.status,
      batchStatus,
    );

    return {
      status: overallStatus,
      timestamp,
      details: {
        database: {
          status: dbHealth.status,
          error: dbHealth.error,
          metrics: connectionMetrics,
        },
        batchProcessor: {
          status: batchStatus,
          metrics: batchMetrics,
        },
      },
    };
  }

  private evaluateBatchHealth(metrics: any): 'up' | 'degraded' {
    const failureRate = metrics.totalFlushFailures / (metrics.totalBatchesFlushed || 1);
    const memoryUsagePercent = (metrics.currentMemoryUsage / (100 * 1024 * 1024)) * 100;

    if (failureRate > 0.1 || memoryUsagePercent > 90) {
      return 'degraded';
    }

    return 'up';
  }

  private determineOverallStatus(
    dbStatus: 'up' | 'down',
    batchStatus: 'up' | 'degraded',
  ): 'up' | 'down' | 'degraded' {
    if (dbStatus === 'down') {
      return 'down';
    }

    if (batchStatus === 'degraded') {
      return 'degraded';
    }

    return 'up';
  }
}
