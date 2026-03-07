import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';

import { CliService } from './cli.service';

import { RedisService } from '../../../core/redis/redis.service';
import { DatabaseService } from '../../../core/database/database.service';

const mockRedisService = {
  set: jest.fn(),
  get: jest.fn(),
  delete: jest.fn(),
};

const mockDatabaseService = {
  personalAccessTokens: {
    create: jest.fn(),
    delete: jest.fn(),
    findFirst: jest.fn(),
  },
};

describe('CliService', () => {
  let service: CliService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CliService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    service = module.get<CliService>(CliService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize the authentication flow', async () => {
    const state = 'test-state';

    mockRedisService.set.mockResolvedValue({ success: true });

    const result = await service.init(state);

    expect(result).toBeDefined();
    expect(result.code).toBeDefined();
  });

  it('should confirm the authentication flow', async () => {
    const state = 'test-state';
    const code = 'test-code';
    const userId = 'test-user-id';

    mockRedisService.set.mockResolvedValue({ success: true });
    mockRedisService.get.mockResolvedValue({
      success: true,
      data: { state, confirmed: false },
    });

    const result = await service.confirm(userId, code, state);

    expect(result).toBeDefined();
    expect(result.message).toBeDefined();
  });

  it('should not confirm the authentication flow if it was already confirmed', async () => {
    const state = 'test-state';
    const code = 'test-code';
    const userId = 'test-user-id';

    mockRedisService.set.mockResolvedValue({ success: true });
    mockRedisService.get.mockResolvedValue({
      success: true,
      data: { state, confirmed: true },
    });

    await expect(service.confirm(userId, code, state)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should not confirm the state was different', async () => {
    const state = 'test-state';
    const code = 'test-code';
    const userId = 'test-user-id';

    mockRedisService.set.mockResolvedValue({ success: true });
    mockRedisService.get.mockResolvedValue({
      success: true,
      data: { state: 'different-state', confirmed: false },
    });

    await expect(service.confirm(userId, code, state)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should get the token', async () => {
    const testCode = 'test-code';
    const userId = 'test-user-id';

    mockRedisService.get.mockResolvedValue({
      success: true,
      data: { confirmed: true, userId },
    });

    mockRedisService.delete.mockResolvedValue({ success: true });

    mockDatabaseService.personalAccessTokens.create.mockResolvedValue(null);

    const response = await service.getToken(testCode);

    expect(response).toBeDefined();
    expect(response.token).toBeDefined();
  });

  it('should not generate the token because the authentication was not confirmed', async () => {
    const testCode = 'test-code';
    const userId = 'test-user-id';

    mockRedisService.get.mockResolvedValue({
      success: true,
      data: { confirmed: false, userId },
    });

    mockRedisService.delete.mockResolvedValue({ success: true });

    mockDatabaseService.personalAccessTokens.create.mockResolvedValue(null);

    const response = await service.getToken(testCode);

    expect(response).toBeDefined();
    expect(response.token).toBeNull();
  });

  it('should logout the user', async () => {
    const token = 'test-token';

    mockDatabaseService.personalAccessTokens.findFirst.mockResolvedValue({
      id: 'test-id',
      userId: 'test-user-id',
      token: 'test-token',
    });

    mockDatabaseService.personalAccessTokens.delete.mockResolvedValue(null);

    const response = await service.logout(token);

    expect(response.message).toBeDefined();

    expect(mockDatabaseService.personalAccessTokens.delete).toHaveBeenCalled();
  });

  it('should not logout the user because the token does not exist', async () => {
    const token = 'test-token';

    mockDatabaseService.personalAccessTokens.findFirst.mockResolvedValue(null);

    const response = await service.logout(token);

    expect(response.message).toBeDefined();

    expect(
      mockDatabaseService.personalAccessTokens.delete,
    ).not.toHaveBeenCalled();
  });

  it('should logout the user', async () => {
    const token = 'test-token';

    mockDatabaseService.personalAccessTokens.findFirst.mockResolvedValue({
      id: 'test-id',
      userId: 'test-user-id',
      token: 'test-token',
    });

    mockDatabaseService.personalAccessTokens.delete.mockResolvedValue(null);

    const response = await service.logout(token);

    expect(response.message).toBeDefined();

    expect(mockDatabaseService.personalAccessTokens.delete).toHaveBeenCalled();
  });
});
