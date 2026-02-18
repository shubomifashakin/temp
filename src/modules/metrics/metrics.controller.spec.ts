import { Response } from 'express';

import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MetricsController } from './metrics.controller';

import { PrometheusModule } from '../../core/prometheus/prometheus.module';
import { PrometheusService } from '../../core/prometheus/prometheus.service';
import { AppConfigModule } from '../../core/app-config/app-config.module';

const mockPrometheusService = {
  getContentType: jest.fn(),
  getMetrics: jest.fn(),
};

const mockResponse = {
  setHeader: jest.fn(),
  send: jest.fn(),
} as unknown as Response;

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  verbose: jest.fn(),
} as unknown as jest.Mocked<Logger>;

describe('MetricsController', () => {
  let controller: MetricsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        {
          provide: PrometheusService,
          useValue: mockPrometheusService,
        },
      ],
      imports: [AppConfigModule, PrometheusModule],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    module.useLogger(mockLogger);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return metrics', async () => {
    mockPrometheusService.getContentType.mockReturnValue('text/plain');
    mockPrometheusService.getMetrics.mockResolvedValue('metrics');

    await controller.getMetrics(mockResponse);

    expect(mockPrometheusService.getContentType).toHaveBeenCalled();
    expect(mockPrometheusService.getMetrics).toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockResponse.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'text/plain',
    );
    expect(mockResponse.send).toHaveBeenCalledWith('metrics');
  });
});
