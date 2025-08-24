export interface EnvironmentConfig {
  development: {
    batchSize: number;
    flushInterval: number;
    maxMemoryUsage: number;
    enableMetrics: boolean;
    logLevel: 'error' | 'warn' | 'info';
  };
  production: {
    batchSize: number;
    flushInterval: number;
    maxMemoryUsage: number;
    enableMetrics: boolean;
    logLevel: 'error' | 'warn' | 'info';
  };
  test: {
    batchSize: number;
    flushInterval: number;
    maxMemoryUsage: number;
    enableMetrics: boolean;
    logLevel: 'error' | 'warn' | 'info';
  };
}

export const DEFAULT_ENVIRONMENT_CONFIG: EnvironmentConfig = {
  development: {
    batchSize: 100,
    flushInterval: 2000,
    maxMemoryUsage: 50,
    enableMetrics: true,
    logLevel: 'info',
  },
  production: {
    batchSize: 1000,
    flushInterval: 10000,
    maxMemoryUsage: 200,
    enableMetrics: true,
    logLevel: 'error',
  },
  test: {
    batchSize: 10,
    flushInterval: 500,
    maxMemoryUsage: 10,
    enableMetrics: false,
    logLevel: 'error',
  },
};
