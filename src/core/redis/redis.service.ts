import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

import { createClient, RedisClientType, SetOptions } from 'redis';

import { makeError } from '../../common/utils';
import { FnResult } from '../../types/common.types';

@Injectable()
export class RedisService implements OnModuleDestroy, OnModuleInit {
  private readonly client: RedisClientType;
  logger = new Logger(RedisService.name);

  constructor(private readonly configService: ConfigService) {
    this.client = createClient({
      name: 'Temp-Backend',
      url: configService.get<string>('REDIS_URL'),
    });
  }

  async set(
    key: string,
    value: any,
    options?: SetOptions,
  ): Promise<FnResult<null>> {
    try {
      await this.client.set(key, JSON.stringify(value), options);

      return { success: true, data: null, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  async get<T>(key: string): Promise<FnResult<T | null>> {
    try {
      const result = await this.client.get(key);

      return {
        success: true,
        data: result ? (JSON.parse(result) as T) : null,
        error: null,
      };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  async delete(key: string): Promise<FnResult<null>> {
    try {
      await this.client.del(key);

      return { success: true, data: null, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    try {
      const currentCount = await this.client.incr(key);

      if (currentCount === 1) {
        await this.client.expire(key, ttl);
      }
      const resetTime = Date.now() + ttl * 1000;
      const isBlocked = currentCount > limit;

      if (isBlocked && currentCount === limit + 1) {
        await this.client.expire(key, ttl + blockDuration);
      }

      const obj = {
        totalHits: currentCount,
        isBlocked: currentCount >= limit,
        timeToExpire: resetTime,
        timeToBlockExpire: resetTime + blockDuration * 1000,
      };

      return obj;
    } catch (error) {
      console.error('Redis error in increment:', error);
      //dont let redis issues block users from using the app

      return {
        totalHits: 0,
        isBlocked: false,
        timeToExpire: 0,
        timeToBlockExpire: 0,
      };
    }
  }

  async onModuleInit() {
    await this.client.connect();

    this.client.on('error', (err: unknown) => {
      this.logger.error({
        message: 'Redis error',
        error: err,
      });
    });
  }

  async onModuleDestroy() {
    try {
      await this.client.quit();
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error: unknown) {
      this.client.destroy();
    }
  }
}
