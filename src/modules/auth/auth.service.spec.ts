/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import {
  Logger,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';

import { AuthService } from './auth.service';

import { RedisModule } from '../../core/redis/redis.module';
import { RedisService } from '../../core/redis/redis.service';
import { DatabaseService } from '../../core/database/database.service';
import { DatabaseModule } from '../../core/database/database.module';

import { makeOauthStateKey } from '../../common/utils';
import { AppConfigService } from '../../core/app-config/app-config.service';
import { AppConfigModule } from '../../core/app-config/app-config.module';

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

const mockLogger = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  verbose: jest.fn(),
} as unknown as jest.Mocked<Logger>;

const mockAppConfigService = {
  GoogleClientId: {
    data: 'test-value',
    success: true,
    error: null,
  },
  GoogleClientSecret: {
    data: 'test-value',
    success: true,
    error: null,
  },
  BaseUrl: {
    data: 'test-value',
    success: true,
    error: null,
  },
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { useValue: mockAppConfigService, provide: AppConfigService },
      ],
      imports: [DatabaseModule, RedisModule, AppConfigModule, JwtModule],
    })
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .overrideProvider(DatabaseService)
      .useValue(mockDatabase)
      .overrideProvider(JwtService)
      .useValue(mockJwtService)
      .compile();

    service = module.get<AuthService>(AuthService);

    module.useLogger(mockLogger);

    jest.clearAllMocks();
    jest.resetAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return a valid authorize url', async () => {
    const baseUrl = 'test-base-url';
    const clientId = 'test-client-id';
    mockAppConfigService.GoogleClientId.data = clientId;
    mockAppConfigService.BaseUrl.data = baseUrl;

    mockRedisService.set.mockResolvedValue({ success: true });

    const url = await service.authorize();

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',

      'https://www.googleapis.com/auth/userinfo.profile',
    ];

    const searchParams = new URLSearchParams({
      client_id: clientId,
      redirect_uri: `${baseUrl}/api/v1/auth/google/callback`,
      response_type: 'code',
      scope: scopes.join(' '),
      state: STABLE_UUID,
    });

    expect(url).toBeDefined();
    expect(url).toBe(
      `https://accounts.google.com/o/oauth2/v2/auth?${searchParams.toString()}`,
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

    const result = await service.callback('test-state', 'test-code');

    expect(mockRedisService.get).toHaveBeenCalledTimes(1);
    expect(mockRedisService.get).toHaveBeenCalledWith(
      makeOauthStateKey('test-state'),
    );

    expect(mockRedisService.delete).toHaveBeenCalledTimes(1);
    expect(mockRedisService.delete).toHaveBeenCalledWith(
      makeOauthStateKey('test-state'),
    );

    expect(mockJwtService.decode).toHaveBeenCalledWith('test-id-token');

    expect(mockDatabase.refreshToken.create).toHaveBeenCalledWith({
      data: {
        token_id: expect.any(String),
        user_id: 'test-user-id',
        expires_at: expect.any(Date),
      },
    });

    expect(result).toBeDefined();
    expect(result).toEqual({
      accessToken: 'test-access-token',
      refreshToken: 'test-refresh-token',
    });
  });

  it('should not generate the tokens since google fetch failed', async () => {
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

    await expect(service.callback('test-state', 'test-code')).rejects.toThrow(
      InternalServerErrorException,
    );

    expect(mockRedisService.get).toHaveBeenCalledTimes(1);
    expect(mockRedisService.get).toHaveBeenCalledWith(
      makeOauthStateKey('test-state'),
    );
  });

  it('should logout the user', async () => {
    mockJwtService.decode
      .mockResolvedValueOnce({ jti: 'access-token-id' })
      .mockReturnValue({ jti: 'refresh-token-id' });

    mockDatabase.refreshToken.findUnique.mockResolvedValue(true);

    mockDatabase.refreshToken.delete.mockResolvedValue(true);

    const response = await service.logout('test-access-token', 'refresh-token');
    expect(response.message).toBeDefined();
  });

  it('should refresh the token', async () => {
    const refreshToken = 'test-refresh-token';
    const testUserId = 'test-user-id';

    mockJwtService.decode.mockReturnValue({ jti: 'test-refresh-token-id' });

    mockDatabase.refreshToken.findUnique.mockResolvedValue({
      expires_at: new Date(Date.now() * 1000000),
      user: {
        id: testUserId,
      },
    });

    mockDatabase.refreshToken.delete.mockResolvedValue(true);

    mockJwtService.signAsync
      .mockResolvedValueOnce('test-access-token')
      .mockResolvedValueOnce('test-refresh-token-new');

    mockDatabase.refreshToken.create.mockResolvedValue(true);

    const response = await service.refresh(refreshToken);

    expect(response.accessToken).toBe('test-access-token');
    expect(response.refreshToken).toBe('test-refresh-token-new');
  });

  it('should not refresh the token if no tokenId was present', async () => {
    const refreshToken = 'test-refresh-token';

    mockJwtService.decode.mockReturnValue({ jti: null });

    await expect(service.refresh(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should not refresh the token if token did not exist in database', async () => {
    const refreshToken = 'test-refresh-token';

    mockJwtService.decode.mockReturnValue({ jti: 'token-id' });

    mockDatabase.refreshToken.findUnique.mockResolvedValue(null);

    await expect(service.refresh(refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );

    expect(mockDatabase.refreshToken.findUnique).toHaveBeenCalled();
  });
});
