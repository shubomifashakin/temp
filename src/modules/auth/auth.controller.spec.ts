import { Request, Response } from 'express';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import {
  UnauthorizedException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

import { RedisModule } from '../../core/redis/redis.module';
import { DatabaseModule } from '../../core/database/database.module';
import { RedisService } from '../../core/redis/redis.service';
import { DatabaseService } from '../../core/database/database.service';

import { TOKEN } from '../../common/constants';

const configValue = 'test';
const mockConfigService = {
  getOrThrow: jest.fn().mockReturnValue(configValue),
};

const mockRedisService = {
  set: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

const STABLE_UUID = 'aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee';

jest.mock('uuid', () => ({
  v4: () => STABLE_UUID,
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockDatabase = {
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
  },
};

const mockJwtService = {
  signAsync: jest.fn(),
  decode: jest.fn(),
};

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
      providers: [AuthService],
      controllers: [AuthController],
      imports: [DatabaseModule, RedisModule, JwtModule, ConfigModule],
    })
      .overrideProvider(ConfigService)
      .useValue(mockConfigService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(DatabaseService)
      .useValue(mockDatabase)
      .overrideProvider(JwtService)
      .useValue(mockJwtService)
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
      mockRedisService.set.mockResolvedValue({ success: true });
      await controller.authorize(mockResponse);

      expect(mockResponse.redirect).toHaveBeenCalledWith(
        expect.stringContaining('https://accounts.google.com/o/oauth2/v2/auth'),
      );
    });

    it('should generate the tokens', async () => {
      mockRedisService.get.mockResolvedValue({
        success: true,
        data: { timestamp: Date.now() },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue({
          scope: 'test-scope',
          id_token: 'test-id-token',
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
        }),
      });

      mockRedisService.delete.mockResolvedValue({
        success: true,
      });

      mockJwtService.decode.mockReturnValue({
        email: 'test-email@email.com',
        sub: 'test-sub',
        name: 'test-name',
        picture: 'test-picture',
        iss: 'test-iss',
        auth_time: 'test-auth-time',
      });

      mockDatabase.user.findUnique.mockResolvedValue({
        id: 'test-user-id',
        email: 'test-email@email.com',
      });

      mockJwtService.signAsync
        .mockResolvedValueOnce('test-access-token')
        .mockResolvedValueOnce('test-refresh-token');

      mockDatabase.refreshToken.create.mockResolvedValue(null);

      await controller.callback(mockResponse, 'test-state', 'test-code');

      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);
      expect(mockResponse.redirect).toHaveBeenCalledWith(
        302,
        expect.stringContaining(configValue + '/dashboard'),
      );
    });

    it('should logout the user', async () => {
      mockJwtService.decode
        .mockReturnValueOnce({
          jti: 'test-access-tji',
        })
        .mockReturnValueOnce({
          jti: 'test-refresh-tji',
        });

      mockRedisService.set.mockResolvedValue({ success: true });

      mockDatabase.refreshToken.findUnique.mockResolvedValue({
        token_id: 'test-refresh-tji',
      });

      mockDatabase.refreshToken.delete.mockResolvedValue(null);

      const result = await controller.logout(mockRequest, mockResponse);

      expect(mockResponse.clearCookie).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
      expect(result).toEqual({
        message: 'success',
      });
    });

    it('should logout the user successfuly if refresh token does not exist in db', async () => {
      mockJwtService.decode
        .mockReturnValueOnce({
          jti: 'test-access-tji',
        })
        .mockReturnValueOnce({
          jti: 'test-refresh-tji',
        });

      mockRedisService.set.mockResolvedValue({ success: true });

      mockDatabase.refreshToken.findUnique.mockResolvedValue(null);

      const result = await controller.logout(mockRequest, mockResponse);

      expect(mockResponse.clearCookie).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
      expect(result).toEqual({
        message: 'success',
      });
    });

    it('should refresh the tokens', async () => {
      mockJwtService.decode.mockReturnValueOnce({
        jti: 'test-refresh-tji',
      });

      mockDatabase.refreshToken.findUnique.mockResolvedValue({
        user: {
          id: 'test-user-id',
          email: 'test-email@email.com',
        },
        expires_at: new Date(Date.now() * 10),
      });

      mockDatabase.refreshToken.delete.mockResolvedValue(null);

      mockJwtService.signAsync
        .mockResolvedValueOnce('test-access-token')
        .mockResolvedValueOnce('test-refresh-token');

      mockDatabase.refreshToken.create.mockResolvedValue(null);

      const result = await controller.refresh(mockRequest, mockResponse);

      expect(mockResponse.cookie).toHaveBeenCalledTimes(2);

      expect(result).toBeDefined();
      expect(result).toEqual({
        message: 'success',
      });
    });
  });

  describe('Unsuccessful Tests', () => {
    it('should not authorize because of redis failed to store state', async () => {
      mockRedisService.set.mockResolvedValue({
        success: false,
        error: 'Failed state',
      });

      await expect(controller.authorize(mockResponse)).rejects.toThrow(
        InternalServerErrorException,
      );
    });

    it('should not generate the tokens because of invalid state', async () => {
      mockRedisService.get.mockResolvedValue({
        success: true,
        data: null,
      });

      await expect(
        controller.callback(mockResponse, 'test-state', 'test-code'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should not generate the tokens because fetch to google failed', async () => {
      mockRedisService.get.mockResolvedValue({
        success: true,
        data: { timestamp: Date.now() },
      });

      mockFetch.mockResolvedValue({
        ok: false,
        json: jest.fn().mockResolvedValue({
          scope: 'test-scope',
          id_token: 'test-id-token',
          access_token: 'test-access-token',
          refresh_token: 'test-refresh-token',
        }),
        text: jest.fn().mockResolvedValue('test-error'),
      });

      await expect(
        controller.callback(mockResponse, 'test-state', 'test-code'),
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should not refresh the tokens because of invalid refresh token', async () => {
      mockJwtService.decode.mockReturnValueOnce({
        jti_invalid: 'test-refresh-tji',
      });

      await expect(
        controller.refresh(mockRequest, mockResponse),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should not refresh the tokens because refresh token did not exist in db', async () => {
      mockJwtService.decode.mockReturnValueOnce({
        jti: 'test-refresh-tji',
      });

      mockDatabase.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        controller.refresh(mockRequest, mockResponse),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should not refresh the tokens because refresh token has expired', async () => {
      mockJwtService.decode.mockReturnValueOnce({
        jti: 'test-refresh-tji',
      });

      mockDatabase.refreshToken.findUnique.mockResolvedValue({
        user: {
          id: 'test-user-id',
          email: 'test-email@email.com',
        },
        expires_at: new Date(1000),
      });

      mockDatabase.refreshToken.delete.mockResolvedValue(null);

      await expect(
        controller.refresh(mockRequest, mockResponse),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
