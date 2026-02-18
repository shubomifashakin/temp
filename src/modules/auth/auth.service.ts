import {
  Logger,
  Injectable,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AppConfigService } from '../../core/app-config/app-config.service';

import { v4 as uuid } from 'uuid';

import { RedisService } from '../../core/redis/redis.service';
import { DatabaseService } from '../../core/database/database.service';

import { makeBlacklistedKey, makeOauthStateKey } from '../../common/utils';
import {
  DEFAULT_JWT_ALG,
  MESSAGES,
  MINUTES_1,
  TOKEN,
} from '../../common/constants';
import { makeError } from '../../common/utils';

import { FnResult } from '../../types/common.types';

@Injectable()
export class AuthService {
  private logger = new Logger(AuthService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: AppConfigService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
  ) {}

  private async generateToken(userInfo: {
    id: string;
  }): Promise<FnResult<{ accessToken: string; refreshToken: string }>> {
    try {
      const accessTokenId = uuid();

      const refreshTokenId = uuid();

      const [accessToken, refreshToken] = await Promise.all([
        this.jwtService.signAsync(
          {
            userId: userInfo.id,
          },

          {
            algorithm: DEFAULT_JWT_ALG,
            jwtid: accessTokenId,
            expiresIn: TOKEN.ACCESS.EXPIRATION,
          },
        ),

        this.jwtService.signAsync(
          {
            userId: userInfo.id,
          },
          {
            algorithm: DEFAULT_JWT_ALG,
            jwtid: refreshTokenId,
            expiresIn: TOKEN.REFRESH.EXPIRATION,
          },
        ),
      ]);

      await this.databaseService.refreshToken.create({
        data: {
          token_id: refreshTokenId,
          user_id: userInfo.id,
          expires_at: new Date(Date.now() + TOKEN.REFRESH.EXPIRATION_MS),
        },
      });

      return {
        success: true,
        data: { accessToken, refreshToken },
        error: null,
      };
    } catch (error) {
      return { success: false, error: makeError(error), data: null };
    }
  }

  async authorize() {
    const state = uuid();

    const scopes = [
      'https://www.googleapis.com/auth/userinfo.email',

      'https://www.googleapis.com/auth/userinfo.profile',
    ];

    const response_type = 'code';

    const client_Id = this.configService.GoogleClientId;
    this.logger.error({
      message: 'Failed to get google client id',
      error: client_Id.error,
    });

    if (!client_Id.success) {
      throw new InternalServerErrorException(MESSAGES.INTERNAL_SERVER_ERROR);
    }

    const baseUrl = this.configService.BaseUrl;
    if (!baseUrl.success) {
      this.logger.error({
        message: 'Failed to get base url',
        error: baseUrl.error,
      });
      throw new InternalServerErrorException(MESSAGES.INTERNAL_SERVER_ERROR);
    }

    const redirect_uri = baseUrl.data + '/api/v1/auth/google/callback';

    const searchParams = new URLSearchParams({
      client_id: client_Id.data,
      redirect_uri,
      response_type,
      scope: scopes.join(' '),
      state,
    });

    const result = await this.redisService.set(
      makeOauthStateKey(state),
      { timestamp: Date.now() },
      { expiration: { type: 'EX', value: MINUTES_1 } },
    );

    if (!result.success) {
      this.logger.error({
        message: 'Failed to set oauth state in cache',
        error: result.error,
      });

      throw new InternalServerErrorException(MESSAGES.INTERNAL_SERVER_ERROR);
    }

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${searchParams.toString()}`;

    return url;
  }

  async callback(state: string, code: string) {
    if (!state || !code) {
      this.logger.error({
        message: 'No state or code received',
        error: makeError('No state or code received'),
      });

      throw new InternalServerErrorException(MESSAGES.INTERNAL_SERVER_ERROR);
    }

    const { success, data, error } = await this.redisService.get(
      makeOauthStateKey(state),
    );

    if (!success) {
      this.logger.error({
        message: 'Failed to get oauth state from cache',
        error,
      });

      throw new InternalServerErrorException(MESSAGES.INTERNAL_SERVER_ERROR);
    }

    if (!data) {
      this.logger.error({
        message: 'Invalid state',
        error: makeError('State does not exist in cache'),
      });

      throw new UnauthorizedException(MESSAGES.UNAUTHORIZED);
    }

    const client_Id = this.configService.GoogleClientId;

    const client_secret = this.configService.GoogleClientSecret;

    const baseUrl = this.configService.BaseUrl;

    if (!baseUrl.success || !client_Id.success || !client_secret.success) {
      const message = !baseUrl.success
        ? 'Failed to get base url'
        : !client_Id.success
          ? 'Failed to get client id'
          : 'Failed to get client secret';

      const error = !baseUrl.success
        ? baseUrl.error
        : !client_Id.success
          ? client_Id.error
          : client_secret.error;

      this.logger.error({
        message,
        error,
      });

      throw new InternalServerErrorException(MESSAGES.INTERNAL_SERVER_ERROR);
    }

    const url = `https://oauth2.googleapis.com/token`;

    const req = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: client_Id.data,
        client_secret: client_secret.data,
        redirect_uri: baseUrl.data + '/api/v1/auth/google/callback',
      }),
    });

    if (!req.ok) {
      const errorText = await req.text();
      this.logger.error({
        message: 'Failed to exchange OAuth code for tokens',
        error: makeError(`HTTP ${req.status}: ${errorText}`),
      });

      throw new InternalServerErrorException(MESSAGES.INTERNAL_SERVER_ERROR);
    }

    const res = (await req.json()) as {
      scope: string;
      id_token?: string;
      access_token: string;
      refresh_token: string;
    };

    const deleted = await this.redisService.delete(makeOauthStateKey(state));

    if (!deleted.success) {
      this.logger.error({
        message: 'Failed to delete oauth state from cache',
        error: deleted.error,
      });
    }

    if (!res.id_token) {
      this.logger.error({
        message: 'Google OAuth token exchange did not return id_token',
        error: makeError('Google OAuth token exchange did not return id_token'),
      });

      throw new UnauthorizedException(MESSAGES.UNAUTHORIZED);
    }

    const decodedInfo = this.jwtService.decode<{
      email: string;
      sub: string;
      name: string;
      picture?: string;
      iss: string;
      auth_time: string;
    }>(res.id_token);

    let userInfo = await this.databaseService.user.findUnique({
      where: {
        email: decodedInfo.email,
      },
      select: {
        id: true,
      },
    });

    if (!userInfo) {
      userInfo = await this.databaseService.user.create({
        data: {
          name: decodedInfo.name,
          email: decodedInfo.email,
          picture: decodedInfo.picture,
          accounts: {
            create: {
              provider: 'google',
              provider_id: decodedInfo.sub,
            },
          },
        },
        select: {
          id: true,
          name: true,
          picture: true,
        },
      });
    }

    const {
      data: tokens,
      error: tokensError,
      success: tokenSuccess,
    } = await this.generateToken(userInfo);

    if (!tokenSuccess) {
      this.logger.error({
        message: 'Failed to generate tokens',
        error: tokensError,
      });

      throw new InternalServerErrorException(MESSAGES.INTERNAL_SERVER_ERROR);
    }

    return tokens;
  }

  async logout(accessToken: string, refreshToken: string) {
    const accessTokenId = this.jwtService.decode<{ jti: string }>(
      accessToken,
    )?.jti;

    if (accessTokenId) {
      const { success, error } = await this.redisService.set(
        makeBlacklistedKey(accessTokenId),
        true,
        { expiration: { type: 'EX', value: TOKEN.ACCESS.EXPIRATION_SEC } },
      );

      if (!success) {
        this.logger.error({
          message: 'Failed to blacklist access token',
          error,
        });
      }
    }

    const refreshTokenId = this.jwtService.decode<{ jti: string }>(
      refreshToken,
    )?.jti;

    if (!refreshTokenId) {
      return { message: 'success' };
    }

    const refreshExists = await this.databaseService.refreshToken.findUnique({
      where: {
        token_id: refreshTokenId,
      },
    });

    if (!refreshExists) {
      return { message: 'success' };
    }

    await this.databaseService.refreshToken.delete({
      where: {
        token_id: refreshTokenId,
      },
    });

    return { message: 'success' };
  }

  async refresh(refreshToken: string) {
    const refreshTokenId = this.jwtService.decode<{ jti: string }>(
      refreshToken,
    )?.jti;

    if (!refreshTokenId) {
      throw new UnauthorizedException(MESSAGES.UNAUTHORIZED);
    }

    const refreshExists = await this.databaseService.refreshToken.findUnique({
      where: {
        token_id: refreshTokenId,
      },
      select: {
        user: {
          select: {
            id: true,
          },
        },
        expires_at: true,
      },
    });

    if (!refreshExists) {
      throw new UnauthorizedException(MESSAGES.UNAUTHORIZED);
    }

    if (new Date() > refreshExists.expires_at) {
      throw new UnauthorizedException(MESSAGES.UNAUTHORIZED);
    }

    await this.databaseService.refreshToken.delete({
      where: {
        token_id: refreshTokenId,
      },
    });

    const {
      data: tokens,
      error: tokensError,
      success: tokenSuccess,
    } = await this.generateToken({
      id: refreshExists.user.id,
    });

    if (!tokenSuccess) {
      this.logger.error({
        message: 'Failed to generate tokens',
        error: tokensError,
      });

      throw new InternalServerErrorException(MESSAGES.INTERNAL_SERVER_ERROR);
    }

    return tokens;
  }
}
