import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  verbose: jest.fn(),
} as unknown as jest.Mocked<Logger>;

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [HealthService],
    }).compile();

    controller = module.get<HealthController>(HealthController);

    module.useLogger(mockLogger);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('shoudl return the health status', () => {
    const healthDto = controller.getHealth();

    expect(healthDto).toBeDefined();
    expect(healthDto.status).toBe('ok');
    expect(healthDto.timestamp).toBeDefined();
  });
});
