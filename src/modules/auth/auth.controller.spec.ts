/* eslint-disable @typescript-eslint/unbound-method */
import { Request, Response } from 'express';

import { JwtModule } from '@nestjs/jwt';
import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

import { RedisModule } from '../../core/redis/redis.module';
import { DatabaseModule } from '../../core/database/database.module';
import { AppConfigModule } from '../../core/app-config/app-config.module';
import { AppConfigService } from '../../core/app-config/app-config.service';

import { TOKEN } from '../../common/constants';

const mockResponse = {
  cookie: jest.fn(),
  status: jest.fn(),
  json: jest.fn(),
  clearCookie: jest.fn(),
  redirect: jest.fn(),
} as unknown as jest.Mocked<Response>;

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  verbose: jest.fn(),
} as unknown as jest.Mocked<Logger>;

const mockAuthService = {
  authorize: jest.fn(),
  callback: jest.fn(),
  logout: jest.fn(),
  refresh: jest.fn(),
};

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

const mockRequest = {
  cookies: {
    [TOKEN.ACCESS.TYPE]: 'test-access-token',
    [TOKEN.REFRESH.TYPE]: 'test-refresh-token',
  },
} as unknown as jest.Mocked<Request>;

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [{ useValue: mockAuthService, provide: AuthService }],
      controllers: [AuthController],
      imports: [DatabaseModule, RedisModule, JwtModule, AppConfigModule],
    })
      .overrideProvider(AppConfigService)
      .useValue(mockAppConfigService)
      .compile();

    controller = module.get<AuthController>(AuthController);

    module.useLogger(mockLogger);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('Successful Tests', () => {
    it('should authorize', async () => {
      mockAuthService.authorize.mockResolvedValue('test-url');
      await controller.authorize(mockResponse);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('test-url'),
      );
    });

    it('should handle the google callback', async () => {
      mockAuthService.callback.mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      });

      await controller.callback(mockResponse, 'test-state', 'test-code');

      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining('/dashboard'),
      );
    });

    it('should logout the user', async () => {
      mockAuthService.logout.mockResolvedValue({ message: 'success' });

      const result = await controller.logout(mockRequest, mockResponse);

      expect(mockResponse.clearCookie).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
      expect(result).toEqual({
        message: 'success',
      });
    });

    it('should refresh the tokens', async () => {
      mockAuthService.refresh.mockResolvedValue({
        accessToken: 'test-access-token',
        refreshToken: 'test-refresh-token',
      });

      const result = await controller.refresh(mockRequest, mockResponse);

      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);

      expect(result).toBeDefined();
      expect(result).toEqual({
        message: 'success',
      });
    });
  });
});
