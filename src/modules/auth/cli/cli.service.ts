import {
  Logger,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';

import { createHash } from 'node:crypto';

import { v4 as uuid } from 'uuid';

import { MINUTES_10 } from '../../../common/constants';

import { CliAuthInitResponse } from './dto/init-response.dto';
import { CliGetTokenResponseDto } from './dto/get-token-response.dto';

import { RedisService } from '../../../core/redis/redis.service';
import { DatabaseService } from '../../../core/database/database.service';

function makeOauthCodeKey(code: string) {
  return `oauth:code:${code}`;
}

@Injectable()
export class CliService {
  private readonly logger = new Logger(CliService.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly databaseService: DatabaseService,
  ) {}

  async init(state: string): Promise<CliAuthInitResponse> {
    const oauth_code = uuid();

    const { success, error } = await this.redisService.set(
      makeOauthCodeKey(oauth_code),
      { confirmed: false, state },
      {
        expiration: { type: 'EX', value: MINUTES_10 },
      },
    );

    if (!success) {
      this.logger.error({
        message: 'Failed to set oauth code in cache',
        error,
      });

      throw new InternalServerErrorException();
    }

    return { code: oauth_code };
  }

  async confirm(userId: string, code: string, state: string) {
    const { success, data, error } = await this.redisService.get<{
      state: string;
      confirmed: boolean;
    }>(makeOauthCodeKey(code));

    if (!success) {
      this.logger.error({
        message: 'Failed to get oauth code from cache',
        error,
      });

      throw new InternalServerErrorException();
    }

    if (!data || data.state !== state) {
      const message = !data
        ? 'OAuth code not found in cache'
        : 'OAuth code state does not match';

      this.logger.warn({
        message,
      });

      throw new UnauthorizedException('Unauthorized');
    }

    if (data.confirmed) {
      this.logger.warn({
        message: 'OAuth code already confirmed',
      });

      throw new UnauthorizedException('Unauthorized');
    }

    const { success: updateSuccess, error: updateError } =
      await this.redisService.set(
        makeOauthCodeKey(code),
        { confirmed: true, userId, state },
        {
          expiration: { type: 'EX', value: MINUTES_10 },
        },
      );

    if (!updateSuccess) {
      this.logger.error({
        message: 'Failed to update oauth code in cache',
        error: updateError,
      });

      throw new InternalServerErrorException();
    }

    return { message: 'success' };
  }

  async getToken(code: string): Promise<CliGetTokenResponseDto> {
    const { success, data, error } = await this.redisService.get<{
      userId: string;
      confirmed: boolean;
    }>(makeOauthCodeKey(code));

    if (!success) {
      this.logger.error({
        message: 'Failed to get oauth code from cache',
        error,
      });

      throw new InternalServerErrorException();
    }

    if (!data) {
      this.logger.warn({
        message: 'OAuth code not found in cache',
      });

      throw new UnauthorizedException('Unauthorized');
    }

    if (!data.confirmed) {
      this.logger.debug({
        message: 'Token generation requested before confirmation',
      });

      return { token: null };
    }

    const token = uuid();

    const hashedToken = createHash('sha256').update(token).digest('hex');

    await this.databaseService.personalAccessTokens.create({
      data: {
        userId: data.userId,
        token: hashedToken,
      },
    });

    const deleted = await this.redisService.delete(makeOauthCodeKey(code));

    if (!deleted.success) {
      this.logger.error({
        message: 'Failed to delete oauth code from cache',
        error: deleted.error,
      });
    }

    return { token };
  }

  async logout(token: string) {
    const hashedToken = createHash('sha256').update(token).digest('hex');

    const tokenExists =
      await this.databaseService.personalAccessTokens.findFirst({
        where: {
          token: hashedToken,
        },
      });

    if (!tokenExists) {
      return { message: 'success' };
    }

    await this.databaseService.personalAccessTokens.delete({
      where: {
        token: hashedToken,
      },
    });

    return { message: 'success' };
  }
}
