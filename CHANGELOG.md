# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.6] - 2025-08-24

### Fixed

- **Race Condition**: Implemented an atomic batch swapping and locking mechanism in `BatchManager` to prevent log loss under high concurrency.

### Chore

- **Improved E2E Tests**: Refactored the end-to-end tests to use a dedicated stress-test endpoint, providing a more accurate and stable way to validate the batching mechanism under load.
- **Fixed Test Environment**: Correctly configured `ConfigModule` to reliably load environment variables in the NestJS testing environment, resolving persistent connection errors.

## [1.0.4] - 2025-08-24

### Changed

- Improved robustness of error handling across `MongoLoggerService`, `LogInterceptor`, and `BatchManager` to safely process non-Error objects.
- Capped the exponential backoff delay in `ConnectionManager` at 30 seconds to prevent excessively long waits.

## [1.0.3] - 2025-08-24

### Chore

- Upgraded all major dependencies to their latest versions, including NestJS v11, ESLint v9, and Jest v30.
- Migrated build and linting configurations to support ES Modules.

## [1.0.2] - 2025-08-24

### Fixed

- Fixed an issue where the retry logic in `BatchManager` did not correctly update the `totalRetries` metric.

### Changed

- Improved error handling in `handleFlushError` by using optional chaining for safer property access.
- Refactored and improved the unit tests for `BatchManager` to be more robust and reliable.

### Removed

- Removed unused `createForTesting` and `createForProduction` methods from `ConfigFactory` to clean up the codebase.

## [1.0.0] - 2024-08-24

### Added

- Initial release of MongoDB Logs Package for NestJS
- Production-ready MongoDB connection management with auto-reconnect
- Optimized batch logging system with size-based and time-based flushing
- Comprehensive NestJS integration with dynamic modules
- Advanced configuration management with environment support
- Health monitoring and metrics tracking
- Log interceptor for automatic method logging
- Configuration validation and factory patterns
- Comprehensive test suite
- TypeScript support with full type definitions

### Features

- **Connection Management**: Robust MongoDB connection with auto-reconnect, retry mechanisms, and health monitoring
- **Batch Processing**: Optimized batch logging with configurable batch sizes and flush intervals
- **NestJS Integration**: Dynamic modules, dependency injection, decorators, and interceptors
- **Configuration**: Flexible configuration system with environment-specific defaults
- **Monitoring**: Built-in health checks and performance metrics
- **Production Ready**: Error handling, graceful shutdown, and memory management
- **Type Safety**: Full TypeScript support with comprehensive type definitions

