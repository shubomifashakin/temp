import { type Request, type Response } from 'express';

import { Logger } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';

import { UsersService } from './users.service';
import { UsersController } from './users.controller';

import { RedisModule } from '../../core/redis/redis.module';
import { RedisService } from '../../core/redis/redis.service';

import { DatabaseModule } from '../../core/database/database.module';
import { DatabaseService } from '../../core/database/database.service';
import { AppConfigModule } from '../../core/app-config/app-config.module';
import { AppConfigService } from '../../core/app-config/app-config.service';

const mockDatabaseService = {
  user: {
    findUniqueOrThrow: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
  },
  subscription: {
    findFirst: jest.fn(),
  },
};

const mockRedisService = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
};

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
};

const mockJwtService = {
  verifyAsync: jest.fn(),
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
      providers: [UsersService],
      imports: [DatabaseModule, RedisModule, JwtModule, AppConfigModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(JwtService)
      .useValue(mockJwtService)
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

  it('should get the users info from database', async () => {
    const foundUser = {
      name: 'Test User',
      email: 'test@email.com',
      picture: null,
      updated_at: new Date(Date.now() * 1000),
      created_at: new Date(Date.now() * 10),
    };

    mockRedisService.get.mockResolvedValue({ success: true, data: null });

    const date = new Date();
    const subscription = {
      plan: 'PRO',
      current_period_end: date,
      current_period_start: date,
      cancel_at_period_end: true,
    };

    mockDatabaseService.user.findUniqueOrThrow.mockResolvedValue(foundUser);
    mockDatabaseService.subscription.findFirst.mockResolvedValue(subscription);

    mockRedisService.set.mockResolvedValue({
      success: true,
    });

    const res = await controller.getMyInfo(mockRequest);

    expect(res).toEqual({ ...foundUser, subscription });
  });

  it('should get the users info from redis', async () => {
    const foundUser = {
      name: 'Test User',
      email: 'test@email.com',
      picture: null,
      updated_at: new Date(Date.now() * 1000),
      created_at: new Date(Date.now() * 10),
    };

    mockRedisService.get.mockResolvedValue({ success: true, data: foundUser });

    const res = await controller.getMyInfo(mockRequest);

    expect(res).toEqual(foundUser);

    expect(mockDatabaseService.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('should update the users account', async () => {
    const updatedName = 'Updated Name';
    const updatedUser = {
      name: updatedName,
      email: 'test@email.com',
      picture: null,
      updated_at: new Date(Date.now() * 1000),
      created_at: new Date(Date.now() * 10),
    };

    mockDatabaseService.user.update.mockResolvedValue(updatedUser);

    mockRedisService.delete.mockResolvedValue({ success: true });

    const res = await controller.updateMyInfo(mockRequest, {
      name: updatedName,
    });

    expect(mockDatabaseService.user.update).toHaveBeenCalledWith({
      where: {
        id: testUserId,
      },
      data: {
        name: updatedName,
      },
      select: {
        name: true,
        email: true,
        picture: true,
        updated_at: true,
        created_at: true,
      },
    });
    expect(res).toEqual({ message: 'success' });
  });

  it('should delete the users account', async () => {
    mockDatabaseService.user.delete.mockResolvedValue(true);
    mockRedisService.delete.mockResolvedValue({ success: true });

    const res = await controller.deleteMyInfo(mockRequest, mockResponse);

    expect(res.message).toBeDefined();

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockResponse.clearCookie).toHaveBeenCalledTimes(2);
  });
});
