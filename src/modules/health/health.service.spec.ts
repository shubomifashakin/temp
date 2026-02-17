import { Logger } from '@nestjs/common';

import { Test, TestingModule } from '@nestjs/testing';
import { HealthService } from './health.service';

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  verbose: jest.fn(),
} as unknown as jest.Mocked<Logger>;

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HealthService],
    }).compile();

    service = module.get<HealthService>(HealthService);

    module.useLogger(mockLogger);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return health', () => {
    expect(service.getHealth()).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    });
  });
});
