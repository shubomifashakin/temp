import { Injectable, Logger } from '@nestjs/common';

import { CachedUserInfo } from './entities/user.dto';
import { UpdateUserDto } from './entities/update-user.dto';

import { RedisService } from '../../core/redis/redis.service';
import { DatabaseService } from '../../core/database/database.service';

import { makeUserKey } from '../../common/utils';
import { MINUTES_10 } from '../../common/constants';

@Injectable()
export class UsersService {
  private logger = new Logger(UsersService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly databaseService: DatabaseService,
  ) {}

  async getMyInfo(userId: string): Promise<CachedUserInfo> {
    const { success, error, data } =
      await this.redisService.get<CachedUserInfo>(makeUserKey(userId));

    if (!success) {
      this.logger.error({
        message: 'Failed to get user info from cache',
        error,
      });
    }

    if (success && data) {
      return data;
    }

    const user = (await this.databaseService.user.findUniqueOrThrow({
      where: {
        id: userId,
      },
      select: {
        name: true,
        email: true,
        picture: true,
        updated_at: true,
        created_at: true,
      },
    })) satisfies CachedUserInfo;

    return user;
  }

  async updateMyInfo(
    userId: string,
    dto: UpdateUserDto,
  ): Promise<CachedUserInfo> {
    const updated = await this.databaseService.user.update({
      where: {
        id: userId,
      },
      data: {
        name: dto.name,
      },
      select: {
        name: true,
        email: true,
        picture: true,
        updated_at: true,
        created_at: true,
      },
    });

    const { success, error } = await this.redisService.set(
      makeUserKey(userId),
      updated,
      {
        expiration: { type: 'EX', value: MINUTES_10 },
      },
    );

    if (!success) {
      this.logger.error({
        message: 'Failed to store updated user info in cache',
        error,
      });
    }

    return updated;
  }

  async deleteMyInfo(userId: string) {
    await this.databaseService.user.delete({
      where: {
        id: userId,
      },
    });

    const { success, error } = await this.redisService.delete(
      makeUserKey(userId),
    );

    if (!success) {
      this.logger.error({
        message: 'Failed to delete user info from cache',
        error,
      });
    }

    return { message: 'success' };
  }
}
