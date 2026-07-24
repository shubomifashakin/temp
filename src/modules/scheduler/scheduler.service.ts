import { spawn } from 'child_process';

import { Cron, Interval } from '@nestjs/schedule';
import { Injectable, Logger } from '@nestjs/common';

import { S3Service } from '../../core/s3/s3.service';
import { SqsService } from '../../core/sqs/sqs.service';
import { DatabaseService } from '../../core/database/database.service';
import { AppConfigService } from '../../core/app-config/app-config.service';

const CLAMAV_BIN = '/usr/bin/clamscan';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private isScanning = false;

  constructor(
    private readonly s3Service: S3Service,
    private readonly sqsService: SqsService,
    private readonly configService: AppConfigService,
    private readonly databaseService: DatabaseService,
  ) {}

  @Cron('0 0 * * *', { name: 'metadata-cleanup', waitForCompletion: true })
  async handleMetadataCleanup() {
    this.logger.log({ message: 'Starting metadata cleanup task' });

    const files = await this.databaseService.file.deleteMany({
      where: {
        status: 'pending',
        createdAt: {
          lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        },
      },
      limit: 100,
    });

    this.logger.log({
      message: 'Metadata cleanup task completed',
      filesDeleted: files.count,
    });
  }

  @Interval(5 * 60 * 1000)
  async handleFileScan() {
    if (this.isScanning) return;
    this.logger.log({ message: 'Starting file scan task' });

    const scanQueueUrl = this.configService.ScanQueueUrl.data;
    if (!scanQueueUrl) {
      this.logger.error({ message: 'SCAN_QUEUE_URL not set, skipping scan' });
      return;
    }

    this.isScanning = true;

    try {
      const { success, data: messages } = await this.sqsService.receiveMessages(
        { queueUrl: scanQueueUrl, maxMessages: 5 },
      );

      if (!success || !messages?.length) {
        this.logger.log({ message: 'No messages to process' });
        return;
      }

      this.logger.log({ message: `Scanning ${messages.length} files` });

      for (const message of messages) {
        await this.processMessage(message, scanQueueUrl);
      }
    } finally {
      this.isScanning = false;
    }
  }

  private async processMessage(
    message: { body: string; receiptHandle: string },
    scanQueueUrl: string,
  ) {
    const s3Key = this.extractS3Key(message.body);

    if (!s3Key) {
      this.logger.warn({
        message:
          'Could not extract S3 key from SQS message, invalid message, discarding',
      });

      await this.sqsService.deleteMessage({
        queueUrl: scanQueueUrl,
        receiptHandle: message.receiptHandle,
      });

      return;
    }

    const file = await this.databaseService.file.findFirst({
      where: { s3Key },
    });

    if (!file) {
      this.logger.warn({
        message: 'File does not exist in db, skipping',
        s3Key,
      });

      await this.sqsService.deleteMessage({
        queueUrl: scanQueueUrl,
        receiptHandle: message.receiptHandle,
      });

      return;
    }

    if (file.status !== 'pending') {
      this.logger.log({
        message: 'File already processed, skipping',
        s3Key,
        status: file.status,
      });

      await this.sqsService.deleteMessage({
        queueUrl: scanQueueUrl,
        receiptHandle: message.receiptHandle,
      });

      return;
    }

    const bucket = this.configService.S3BucketName.data;
    if (!bucket) {
      this.logger.error({ message: 'S3_BUCKET_NAME not set' });
      return;
    }

    const { data: stream, error } = await this.s3Service.getObjectStream({
      key: s3Key,
      bucket,
    });

    if (error) {
      this.logger.error({
        message: 'Failed to stream S3 object',
        s3Key,
        error,
      });

      return;
    }

    if (!stream) {
      this.logger.warn({ message: 'No stream exists for key', s3Key });
      return;
    }

    let infected: boolean;
    try {
      infected = await this.scanStream(stream);
    } catch (error: unknown) {
      this.logger.error({ message: 'ClamAV scan failed', s3Key, error });
      return;
    }

    if (infected) {
      this.logger.warn({ message: 'Infected file detected', s3Key });

      await this.databaseService.file.deleteMany({ where: { s3Key } });

      const infectedQueueUrl = this.configService.InfectedFilesQueueUrl.data;
      if (infectedQueueUrl) {
        await this.sqsService.pushMessage({
          queueUrl: infectedQueueUrl,
          message: { s3Key },
        });
      }
    } else {
      await this.databaseService.file.updateMany({
        where: { s3Key },
        data: { status: 'safe' },
      });
    }

    await this.sqsService.deleteMessage({
      queueUrl: scanQueueUrl,
      receiptHandle: message.receiptHandle,
    });
  }

  private extractS3Key(body: string): string | null {
    try {
      const parsed = JSON.parse(body) as {
        Records?: Array<{ s3?: { object?: { key?: string } } }>;
      };
      const key = parsed.Records?.[0]?.s3?.object?.key;
      return key ? decodeURIComponent(key) : null;
    } catch {
      return null;
    }
  }

  private scanStream(stream: NodeJS.ReadableStream): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const clamscan = spawn(CLAMAV_BIN, [
        '--no-summary',
        '--max-filesize=0',
        '--max-scansize=0',
        '-',
      ]);

      stream.pipe(clamscan.stdin);

      clamscan.on('close', (code) => resolve(code === 1));
      clamscan.on('error', reject);
    });
  }
}
