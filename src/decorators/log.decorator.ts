import { SetMetadata } from '@nestjs/common';

export const LOG_METADATA_KEY = 'log_metadata';

export interface LogDecoratorOptions {
  collection?: string;
  level?: string;
  includeArgs?: boolean;
  includeResult?: boolean;
  excludeFields?: string[];
}

export const Log = (options: LogDecoratorOptions = {}): MethodDecorator => {
  return SetMetadata(LOG_METADATA_KEY, options);
};
