import { type Request } from 'express';

import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { CliService } from './cli.service';
import { CliController } from './cli.controller';

import { TOKEN } from '../../../common/constants';

import { RedisModule } from '../../../core/redis/redis.module';
import { DatabaseModule } from '../../../core/database/database.module';
import { AppConfigModule } from '../../../core/app-config/app-config.module';
import { AppConfigService } from '../../../core/app-config/app-config.service';

const mockAppConfigService = {
  FrontendUrl: {
    data: 'test-value',
    success: true,
    error: null,
  },
  Domain: {
    data: 'test-value',
    success: true,
    error: null,
  },
  DatabaseUrl: {
    data: 'test-value',
    success: true,
    error: null,
  },
  RedisUrl: {
    data: 'redis://localhost:6379',
    success: true,
    error: null,
  },
  ServiceName: {
    data: 'test-service',
    success: true,
    error: null,
  },
};

const mockCliService = {
  logout: jest.fn(),
  getToken: jest.fn(),
  confirm: jest.fn(),
  init: jest.fn(),
};

const mockRequest = {
  cookies: {
    [TOKEN.ACCESS.TYPE]: 'test-access-token',
    [TOKEN.REFRESH.TYPE]: 'test-refresh-token',
  },
  headers: {
    authorization: `Bearer test-token`,
  },
} as unknown as jest.Mocked<Request>;

describe('CliController', () => {
  let controller: CliController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CliController],
      providers: [{ provide: CliService, useValue: mockCliService }],
      imports: [JwtModule, DatabaseModule, RedisModule, AppConfigModule],
    })
      .overrideProvider(AppConfigService)
      .useValue(mockAppConfigService)
      .compile();

    controller = module.get<CliController>(CliController);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should logout the user', async () => {
    mockCliService.logout.mockResolvedValue({
      message: 'Logged out successfully',
    });

    const response = await controller.logout(mockRequest);

    expect(response.message).toBeDefined();
  });
});
