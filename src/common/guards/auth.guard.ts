import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';

import {
  Logger,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { RedisService } from '../../core/redis/redis.service';

import { TOKEN } from '../constants';
import { makeBlacklistedKey } from '../utils';

@Injectable()
export class AuthGuard implements CanActivate {
  logger = new Logger(AuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {}

  async canActivate(ctx: ExecutionContext) {
    const requestType = ctx.getType();

    if (requestType === 'http') {
      try {
        const request = ctx.switchToHttp().getRequest<Request>();
        const accessToken = request.cookies[TOKEN.ACCESS.TYPE] as
          | string
          | undefined;

        if (!accessToken) {
          throw new UnauthorizedException('Unauthorized');
        }

        const claims = await this.jwtService.verifyAsync<{
          jti: string;
          userId: string;
        }>(accessToken);

        if (!claims) {
          throw new UnauthorizedException('Unauthorized');
        }

        const blacklisted = await this.redisService.get<boolean>(
          makeBlacklistedKey(claims.jti),
        );

        if (!blacklisted.success) {
          this.logger.error({
            message: 'Failed to get blacklisted token from redis',
            error: blacklisted.error,
          });

          throw new UnauthorizedException('Unauthorized');
        }

        if (blacklisted.data) {
          throw new UnauthorizedException('Unauthorized');
        }

        request.user = { id: claims.userId };

        return true;
      } catch (error: unknown) {
        this.logger.error({
          message: 'Failed to verify access token',
          error,
        });

        throw new UnauthorizedException('Unauthorized');
      }
    }

    throw new UnauthorizedException('Unauthorized');
  }
}
