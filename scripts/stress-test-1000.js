#!/usr/bin/env node

const { MongoClient } = require('mongodb');
const { performance } = require('perf_hooks');

// Test configuration
const ITERATIONS = 1000;
const CONCURRENT_BATCHES = 10;
const MONGODB_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/stress-test';

// Test metrics
const metrics = {
  totalOperations: 0,
  successfulOperations: 0,
  failedOperations: 0,
  totalTime: 0,
  averageResponseTime: 0,
  minResponseTime: Infinity,
  maxResponseTime: 0,
  memoryUsage: [],
  errors: [],
  startTime: null,
  endTime: null
};

// Mock MongoDB Logger functionality for stress testing
class StressTestLogger {
  constructor(uri) {
    this.uri = uri;
    this.client = null;
    this.db = null;
    this.batches = new Map();
    this.batchSize = 100;
    this.flushInterval = 1000;
    this.connected = false;
  }

  async connect() {
    try {
      this.client = new MongoClient(this.uri, {
        maxPoolSize: 50,
        minPoolSize: 5,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      await this.client.connect();
      this.db = this.client.db();
      this.connected = true;
      console.log('✅ Connected to MongoDB for stress testing');
    } catch (error) {
      console.error('❌ Failed to connect to MongoDB:', error.message);
      throw error;
    }
  }

  async log(collection, entry) {
    if (!this.connected) {
      throw new Error('Not connected to MongoDB');
    }

    const startTime = performance.now();

    try {
      const logEntry = {
        ...entry,
        timestamp: new Date(),
        _testId: Math.random().toString(36).substr(2, 9)
      };

      await this.db.collection(collection).insertOne(logEntry);

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      // Update metrics
      metrics.successfulOperations++;
      metrics.totalTime += responseTime;
      metrics.minResponseTime = Math.min(metrics.minResponseTime, responseTime);
      metrics.maxResponseTime = Math.max(metrics.maxResponseTime, responseTime);

      return { success: true, responseTime };
    } catch (error) {
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      metrics.failedOperations++;
      metrics.errors.push({
        error: error.message,
        timestamp: new Date(),
        responseTime
      });

      return { success: false, error: error.message, responseTime };
    }
  }

  async batchLog(collection, entries) {
    if (!this.connected) {
      throw new Error('Not connected to MongoDB');
    }

    const startTime = performance.now();

    try {
      const logEntries = entries.map(entry => ({
        ...entry,
        timestamp: new Date(),
        _testId: Math.random().toString(36).substr(2, 9)
      }));

      await this.db.collection(collection).insertMany(logEntries, { ordered: false });

      const endTime = performance.now();
      const responseTime = endTime - startTime;

      // Update metrics
      metrics.successfulOperations += entries.length;
      metrics.totalTime += responseTime;
      metrics.minResponseTime = Math.min(metrics.minResponseTime, responseTime);
      metrics.maxResponseTime = Math.max(metrics.maxResponseTime, responseTime);

      return { success: true, responseTime, count: entries.length };
    } catch (error) {
      const endTime = performance.now();
      const responseTime = endTime - startTime;

      metrics.failedOperations += entries.length;
      metrics.errors.push({
        error: error.message,
        timestamp: new Date(),
        responseTime,
        batchSize: entries.length
      });

      return { success: false, error: error.message, responseTime };
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.connected = false;
      console.log('🔌 Disconnected from MongoDB');
    }
  }
}

// Memory monitoring
function recordMemoryUsage() {
  const usage = process.memoryUsage();
  metrics.memoryUsage.push({
    timestamp: new Date(),
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external
  });
}

// Generate test data
function generateLogEntry(index) {
  return {
    level: ['info', 'warn', 'error'][Math.floor(Math.random() * 3)],
    message: `Stress test log entry #${index}`,
    metadata: {
      testIteration: index,
      userId: `user_${Math.floor(Math.random() * 1000)}`,
      sessionId: Math.random().toString(36).substr(2, 9),
      requestId: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      randomData: Math.random().toString(36).repeat(10) // Add some bulk
    }
  };
}

// Run concurrent stress test
async function runStressTest() {
  console.log(`🚀 Starting stress test with ${ITERATIONS} iterations...`);

  const logger = new StressTestLogger(MONGODB_URI);
  await logger.connect();

  metrics.startTime = new Date();

  // Start memory monitoring
  const memoryMonitor = setInterval(recordMemoryUsage, 1000);

  try {
    const promises = [];

    // Create concurrent batches
    for (let batch = 0; batch < CONCURRENT_BATCHES; batch++) {
      const batchPromise = async () => {
        const iterationsPerBatch = Math.floor(ITERATIONS / CONCURRENT_BATCHES);
        const startIndex = batch * iterationsPerBatch;

        for (let i = 0; i < iterationsPerBatch; i++) {
          const index = startIndex + i;
          metrics.totalOperations++;

          // Mix of single logs and batch logs
          if (i % 10 === 0) {
            // Batch operation every 10th iteration
            const batchEntries = [];
            for (let j = 0; j < 5; j++) {
              batchEntries.push(generateLogEntry(index + j));
            }
            await logger.batchLog('stress-test-batch', batchEntries);
          } else {
            // Single log operation
            await logger.log('stress-test-single', generateLogEntry(index));
          }

          // Progress reporting
          if (index % 100 === 0) {
            console.log(`📊 Progress: ${index}/${ITERATIONS} (${Math.round(index / ITERATIONS * 100)}%)`);
          }
        }
      };

      promises.push(batchPromise());
    }

    // Wait for all batches to complete
    await Promise.all(promises);

  } finally {
    clearInterval(memoryMonitor);
    metrics.endTime = new Date();
    await logger.disconnect();
  }
}

// Generate comprehensive report
function generateReport() {
  const duration = metrics.endTime - metrics.startTime;
  metrics.averageResponseTime = metrics.totalTime / metrics.successfulOperations;

  const maxMemory = Math.max(...metrics.memoryUsage.map(m => m.heapUsed));
  const avgMemory = metrics.memoryUsage.reduce((sum, m) => sum + m.heapUsed, 0) / metrics.memoryUsage.length;

  console.log('\n' + '='.repeat(80));
  console.log('📈 STRESS TEST RESULTS - 1000 ITERATIONS');
  console.log('='.repeat(80));
  console.log(`⏱️  Total Duration: ${duration}ms (${(duration / 1000).toFixed(2)}s)`);
  console.log(`🔢 Total Operations: ${metrics.totalOperations}`);
  console.log(`✅ Successful Operations: ${metrics.successfulOperations}`);
  console.log(`❌ Failed Operations: ${metrics.failedOperations}`);
  console.log(`📈 Success Rate: ${((metrics.successfulOperations / metrics.totalOperations) * 100).toFixed(2)}%`);
  console.log(`⚡ Operations/Second: ${(metrics.totalOperations / (duration / 1000)).toFixed(2)}`);
  console.log(`⏱️  Average Response Time: ${metrics.averageResponseTime.toFixed(2)}ms`);
  console.log(`⚡ Min Response Time: ${metrics.minResponseTime.toFixed(2)}ms`);
  console.log(`⚡ Max Response Time: ${metrics.maxResponseTime.toFixed(2)}ms`);
  console.log(`🧠 Peak Memory Usage: ${(maxMemory / 1024 / 1024).toFixed(2)}MB`);
  console.log(`🧠 Average Memory Usage: ${(avgMemory / 1024 / 1024).toFixed(2)}MB`);

  if (metrics.errors.length > 0) {
    console.log(`\n❌ ERRORS (${metrics.errors.length}):`);
    const errorCounts = {};
    metrics.errors.forEach(err => {
      errorCounts[err.error] = (errorCounts[err.error] || 0) + 1;
    });
    Object.entries(errorCounts).forEach(([error, count]) => {
      console.log(`   - ${error}: ${count} times`);
    });
  }

  console.log('='.repeat(80));

  // Production readiness assessment
  const successRate = (metrics.successfulOperations / metrics.totalOperations) * 100;
  const avgResponseTime = metrics.averageResponseTime;
  const peakMemoryMB = maxMemory / 1024 / 1024;

  console.log('\n🏭 PRODUCTION READINESS ASSESSMENT:');
  console.log('='.repeat(50));

  if (successRate >= 99.9) {
    console.log('✅ SUCCESS RATE: EXCELLENT (≥99.9%)');
  } else if (successRate >= 99) {
    console.log('✅ SUCCESS RATE: GOOD (≥99%)');
  } else if (successRate >= 95) {
    console.log('⚠️  SUCCESS RATE: ACCEPTABLE (≥95%)');
  } else {
    console.log('❌ SUCCESS RATE: POOR (<95%)');
  }

  if (avgResponseTime <= 50) {
    console.log('✅ RESPONSE TIME: EXCELLENT (≤50ms)');
  } else if (avgResponseTime <= 100) {
    console.log('✅ RESPONSE TIME: GOOD (≤100ms)');
  } else if (avgResponseTime <= 200) {
    console.log('⚠️  RESPONSE TIME: ACCEPTABLE (≤200ms)');
  } else {
    console.log('❌ RESPONSE TIME: POOR (>200ms)');
  }

  if (peakMemoryMB <= 100) {
    console.log('✅ MEMORY USAGE: EXCELLENT (≤100MB)');
  } else if (peakMemoryMB <= 200) {
    console.log('✅ MEMORY USAGE: GOOD (≤200MB)');
  } else if (peakMemoryMB <= 500) {
    console.log('⚠️  MEMORY USAGE: ACCEPTABLE (≤500MB)');
  } else {
    console.log('❌ MEMORY USAGE: HIGH (>500MB)');
  }

  const overallScore = (successRate >= 99 ? 1 : 0) +
    (avgResponseTime <= 100 ? 1 : 0) +
    (peakMemoryMB <= 200 ? 1 : 0);

  console.log('\n🎯 OVERALL PRODUCTION READINESS:');
  if (overallScore === 3) {
    console.log('🟢 READY FOR PRODUCTION - All metrics excellent');
  } else if (overallScore === 2) {
    console.log('🟡 MOSTLY READY - Minor optimizations recommended');
  } else if (overallScore === 1) {
    console.log('🟠 NEEDS IMPROVEMENT - Address performance issues');
  } else {
    console.log('🔴 NOT READY - Significant issues need resolution');
  }
}

// Main execution
async function main() {
  try {
    await runStressTest();
    generateReport();
    process.exit(0);
  } catch (error) {
    console.error('💥 Stress test failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
