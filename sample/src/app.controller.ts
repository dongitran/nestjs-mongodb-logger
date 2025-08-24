import { Controller, Get, Post, Body } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('info')
  async logInfo(@Body('message') message: string): Promise<string> {
    await this.appService.logInfo(message);
    return 'Info log sent';
  }

  @Post('error')
  async logError(@Body('message') message: string): Promise<string> {
    await this.appService.logError(message);
    return 'Error log sent';
  }

  @Post('metadata')
  async logWithMetadata(@Body() data: any): Promise<string> {
    await this.appService.logWithMetadata(data);
    return 'Metadata log sent';
  }

  @Post('batch')
  async triggerBatchFlush(): Promise<string> {
    await this.appService.triggerBatchFlush();
    return 'Batch log process triggered';
  }
}
