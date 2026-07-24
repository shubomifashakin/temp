/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call */
import { EventEmitter } from 'events';
import { Readable } from 'stream';

import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { SchedulerService } from './scheduler.service';

import { S3Service } from '../../core/s3/s3.service';
import { SqsService } from '../../core/sqs/sqs.service';
import { DatabaseService } from '../../core/database/database.service';
import { AppConfigService } from '../../core/app-config/app-config.service';

jest.mock('child_process', () => ({
  spawn: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { spawn } = require('child_process') as { spawn: jest.Mock };

const mockDatabaseService = {
  file: {
    deleteMany: jest.fn(),
    updateMany: jest.fn(),
  },
};

const mockS3Service = {
  getObjectStream: jest.fn(),
};

const mockSqsService = {
  receiveMessages: jest.fn(),
  deleteMessage: jest.fn(),
  pushMessage: jest.fn(),
};

const mockAppConfigService = {
  ScanQueueUrl: {
    data: 'https://sqs.test/scan-queue',
    success: true,
    error: null,
  },
  InfectedFilesQueueUrl: {
    data: 'https://sqs.test/infected-queue',
    success: true,
    error: null,
  },
  S3BucketName: { data: 'test-bucket', success: true, error: null },
  FileDeletionQueueUrl: {
    data: 'https://sqs.test/deletion-queue',
    success: true,
    error: null,
  },
};

const makeSqsBody = (key: string) =>
  JSON.stringify({ Records: [{ s3: { object: { key } } }] });

const createMockStream = () =>
  new Readable({
    read() {
      this.push(null);
    },
  });

const makeProc = (exitCode: number) => {
  const proc = new EventEmitter() as any;
  const stdin = new EventEmitter() as any;
  stdin.write = jest.fn().mockReturnValue(true);
  stdin.end = jest.fn();
  proc.stdin = stdin;
  setImmediate(() => proc.emit('close', exitCode));
  return proc;
};

const makeCleanProc = () => makeProc(0);
const makeInfectedProc = () => makeProc(1);

describe('SchedulerService', () => {
  let service: SchedulerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        { provide: AppConfigService, useValue: mockAppConfigService },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: S3Service, useValue: mockS3Service },
        { provide: SqsService, useValue: mockSqsService },
      ],
      imports: [ConfigModule.forRoot()],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('metadataCleanup', () => {
    it('should handle metadata cleanup', async () => {
      mockDatabaseService.file.deleteMany.mockResolvedValueOnce({ count: 0 });

      await service.handleMetadataCleanup();
      expect(mockDatabaseService.file.deleteMany).toHaveBeenCalled();
      expect(mockDatabaseService.file.deleteMany).toHaveBeenCalledWith({
        where: {
          status: 'pending',
          createdAt: {
            lt: expect.any(Date),
          },
        },
        limit: 100,
      });
    });
  });

  describe('handleFileScan', () => {
    it('should skip if already scanning', async () => {
      (service as any).isScanning = true;

      await service.handleFileScan();

      expect(mockSqsService.receiveMessages).not.toHaveBeenCalled();
    });

    it('should reset isScanning to false after completion', async () => {
      mockSqsService.receiveMessages.mockResolvedValueOnce({
        success: true,
        data: [],
      });

      await service.handleFileScan();

      expect((service as any).isScanning).toBe(false);
    });

    it('should skip if ScanQueueUrl is not set', async () => {
      const original = mockAppConfigService.ScanQueueUrl;
      mockAppConfigService.ScanQueueUrl = {
        data: null as unknown as string,
        success: false,
        error: null,
      };

      await service.handleFileScan();

      expect(mockSqsService.receiveMessages).not.toHaveBeenCalled();
      mockAppConfigService.ScanQueueUrl = original;
    });

    it('should do nothing when no messages are returned', async () => {
      mockSqsService.receiveMessages.mockResolvedValueOnce({
        success: true,
        data: [],
      });

      await service.handleFileScan();

      expect(mockS3Service.getObjectStream).not.toHaveBeenCalled();
    });

    it('should request up to 5 messages per run', async () => {
      mockSqsService.receiveMessages.mockResolvedValueOnce({
        success: true,
        data: [],
      });

      await service.handleFileScan();

      expect(mockSqsService.receiveMessages).toHaveBeenCalledWith({
        queueUrl: mockAppConfigService.ScanQueueUrl.data,
        maxMessages: 5,
      });
    });

    it('should mark file as safe when clamscan exits with 0', async () => {
      const key = 'uploads/user/image.png';
      mockSqsService.receiveMessages.mockResolvedValueOnce({
        success: true,
        data: [{ body: makeSqsBody(key), receiptHandle: 'rh-1' }],
      });
      mockS3Service.getObjectStream.mockResolvedValueOnce({
        success: true,
        data: createMockStream(),
      });
      mockDatabaseService.file.updateMany.mockResolvedValueOnce({ count: 1 });
      mockSqsService.deleteMessage.mockResolvedValue({ success: true });
      spawn.mockReturnValue(makeCleanProc());

      await service.handleFileScan();

      expect(mockDatabaseService.file.updateMany).toHaveBeenCalledWith({
        where: { s3Key: key },
        data: { status: 'safe' },
      });
      expect(mockSqsService.deleteMessage).toHaveBeenCalledWith({
        queueUrl: mockAppConfigService.ScanQueueUrl.data,
        receiptHandle: 'rh-1',
      });
    });

    it('should delete file and push to infected queue when clamscan exits with 1', async () => {
      const key = 'uploads/user/malware.exe';
      mockSqsService.receiveMessages.mockResolvedValueOnce({
        success: true,
        data: [{ body: makeSqsBody(key), receiptHandle: 'rh-2' }],
      });
      mockS3Service.getObjectStream.mockResolvedValueOnce({
        success: true,
        data: createMockStream(),
      });
      mockDatabaseService.file.deleteMany.mockResolvedValueOnce({ count: 1 });
      mockSqsService.pushMessage.mockResolvedValue({ success: true });
      mockSqsService.deleteMessage.mockResolvedValue({ success: true });
      spawn.mockReturnValue(makeInfectedProc());

      await service.handleFileScan();

      expect(mockDatabaseService.file.deleteMany).toHaveBeenCalledWith({
        where: { s3Key: key },
      });
      expect(mockSqsService.pushMessage).toHaveBeenCalledWith({
        queueUrl: mockAppConfigService.InfectedFilesQueueUrl.data,
        message: { s3Key: key },
      });
      expect(mockSqsService.deleteMessage).toHaveBeenCalled();
    });

    it('should discard a message with an invalid body and delete it from the queue', async () => {
      mockSqsService.receiveMessages.mockResolvedValueOnce({
        success: true,
        data: [{ body: 'not-valid-json', receiptHandle: 'rh-3' }],
      });
      mockSqsService.deleteMessage.mockResolvedValue({ success: true });

      await service.handleFileScan();

      expect(mockS3Service.getObjectStream).not.toHaveBeenCalled();
      expect(mockSqsService.deleteMessage).toHaveBeenCalledWith({
        queueUrl: mockAppConfigService.ScanQueueUrl.data,
        receiptHandle: 'rh-3',
      });
    });

    it('should decode URL-encoded S3 keys from SQS messages', async () => {
      const decoded = 'uploads/user/file name with spaces.png';
      const encoded = encodeURIComponent(decoded);
      mockSqsService.receiveMessages.mockResolvedValueOnce({
        success: true,
        data: [{ body: makeSqsBody(encoded), receiptHandle: 'rh-4' }],
      });
      mockS3Service.getObjectStream.mockResolvedValueOnce({
        success: true,
        data: createMockStream(),
      });
      mockDatabaseService.file.updateMany.mockResolvedValueOnce({ count: 1 });
      mockSqsService.deleteMessage.mockResolvedValue({ success: true });
      spawn.mockReturnValue(makeCleanProc());

      await service.handleFileScan();

      expect(mockS3Service.getObjectStream).toHaveBeenCalledWith({
        key: decoded,
        bucket: 'test-bucket',
      });
    });

    it('should process multiple messages sequentially per run', async () => {
      const keys = [
        'uploads/user/a.png',
        'uploads/user/b.png',
        'uploads/user/c.png',
      ];
      mockSqsService.receiveMessages.mockResolvedValueOnce({
        success: true,
        data: keys.map((key, i) => ({
          body: makeSqsBody(key),
          receiptHandle: `rh-${i}`,
        })),
      });
      mockS3Service.getObjectStream.mockResolvedValue({
        success: true,
        data: createMockStream(),
      });
      mockDatabaseService.file.updateMany.mockResolvedValue({ count: 1 });
      mockSqsService.deleteMessage.mockResolvedValue({ success: true });
      spawn.mockImplementation(() => makeCleanProc());

      await service.handleFileScan();

      expect(mockS3Service.getObjectStream).toHaveBeenCalledTimes(3);
      expect(mockSqsService.deleteMessage).toHaveBeenCalledTimes(3);
    });

    it('should reset isScanning to false even if an error occurs', async () => {
      mockSqsService.receiveMessages.mockRejectedValueOnce(
        new Error('SQS failure'),
      );

      await service.handleFileScan().catch(() => {});

      expect((service as any).isScanning).toBe(false);
    });
  });
});
