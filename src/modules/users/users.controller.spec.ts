import { type Request, type Response } from 'express';

import { Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';

import { RedisModule } from '../../core/redis/redis.module';

import { DatabaseModule } from '../../core/database/database.module';
import { AppConfigModule } from '../../core/app-config/app-config.module';
import { AppConfigService } from '../../core/app-config/app-config.service';

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  verbose: jest.fn(),
} as unknown as jest.Mocked<Logger>;

const mockAppConfigService = {
  Domain: {
    success: true,
    data: 'test-domain.com',
  },
  DatabaseUrl: {
    success: true,
    data: 'test-url',
  },
  RedisUrl: {
    success: true,
    data: 'redis://localhost:6379',
  },
};

const mockUserService = {
  getMyInfo: jest.fn(),
  updateMyInfo: jest.fn(),
  deleteMyInfo: jest.fn(),
};

const testUserId = 'test-user-id';
const mockRequest = {
  user: {
    id: testUserId,
  },
} as jest.Mocked<Request>;

const mockResponse = {
  clearCookie: jest.fn(),
} as unknown as jest.Mocked<Response>;

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUserService,
        },
      ],
      imports: [DatabaseModule, RedisModule, JwtModule, AppConfigModule],
    })
      .overrideProvider(AppConfigService)
      .useValue(mockAppConfigService)
      .compile();

    controller = module.get<UsersController>(UsersController);

    module.useLogger(mockLogger);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get the users info ', async () => {
    const foundUser = {
      name: 'Test User',
      email: 'test@email.com',
      picture: null,
      updated_at: new Date(Date.now() * 1000),
      created_at: new Date(Date.now() * 10),
    };

    const date = new Date();
    const subscription = {
      plan: 'PRO',
      current_period_end: date,
      current_period_start: date,
      cancel_at_period_end: true,
    };

    mockUserService.getMyInfo.mockResolvedValue({ ...foundUser, subscription });

    const res = await controller.getMyInfo(mockRequest);

    expect(res).toEqual({ ...foundUser, subscription });
  });

  it('should update the users account', async () => {
    const updatedName = 'Updated Name';

    mockUserService.updateMyInfo.mockResolvedValue({ message: 'success' });

    const res = await controller.updateMyInfo(mockRequest, {
      name: updatedName,
    });

    expect(res).toEqual({ message: 'success' });
  });

  it('should delete the users account', async () => {
    mockUserService.deleteMyInfo.mockResolvedValue({ message: 'success' });

    const res = await controller.deleteMyInfo(mockRequest, mockResponse);

    expect(res.message).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockResponse.clearCookie).toHaveBeenCalledTimes(2);
  });
});
