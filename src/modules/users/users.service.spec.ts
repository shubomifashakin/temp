import { Test, TestingModule } from '@nestjs/testing';

import { UsersService } from './users.service';

import { RedisModule } from '../../core/redis/redis.module';
import { RedisService } from '../../core/redis/redis.service';
import { DatabaseService } from '../../core/database/database.service';
import { DatabaseModule } from '../../core/database/database.module';

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

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
      imports: [DatabaseModule, RedisModule],
    })
      .overrideProvider(DatabaseService)
      .useValue(mockDatabaseService)
      .overrideProvider(RedisService)
      .useValue(mockRedisService)
      .compile();

    service = module.get<UsersService>(UsersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get the users info from database', async () => {
    const testUserId = 'test-user-id';
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

    const res = await service.getMyInfo(testUserId);

    expect(res).toEqual({ ...foundUser, subscription });
  });

  it('should get the users info from redis', async () => {
    const testUserId = 'test-user-id';
    const foundUser = {
      name: 'Test User',
      email: 'test@email.com',
      picture: null,
      updated_at: new Date(Date.now() * 1000),
      created_at: new Date(Date.now() * 10),
    };

    mockRedisService.get.mockResolvedValue({ success: true, data: foundUser });

    const res = await service.getMyInfo(testUserId);

    expect(res).toEqual(foundUser);

    expect(mockDatabaseService.user.findUniqueOrThrow).not.toHaveBeenCalled();
  });

  it('should update the users account', async () => {
    const testUserId = 'test-user-id';

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

    const res = await service.updateMyInfo(testUserId, {
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
    const testUserId = 'test-user-id';

    mockDatabaseService.user.delete.mockResolvedValue(true);
    mockRedisService.delete.mockResolvedValue({ success: true });

    const res = await service.deleteMyInfo(testUserId);

    expect(res.message).toBeDefined();
  });
});
