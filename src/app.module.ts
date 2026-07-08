import { Request } from 'express';

import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Module, RequestMethod } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { v4 as uuid } from 'uuid';

import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FilesModule } from './modules/files/files.module';
import { LinksModule } from './modules/links/links.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { SchedulerModule } from './modules/scheduler/scheduler.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';

import { S3Module } from './core/s3/s3.module';
import { SqsModule } from './core/sqs/sqs.module';
import { RedisModule } from './core/redis/redis.module';
import { PolarModule } from './core/polar/polar.module';
import { RedisService } from './core/redis/redis.service';
import { HasherModule } from './core/hasher/hasher.module';
import { DatabaseModule } from './core/database/database.module';
import { PrometheusModule } from './core/prometheus/prometheus.module';
import { AppConfigModule } from './core/app-config/app-config.module';
import { AppConfigService } from './core/app-config/app-config.service';

import { validateConfig } from './common/utils';
import { MetricsInterceptor } from './common/interceptors/metrics.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: false,
      validate: (config) => {
        validateConfig(config);

        return config;
      },
    }),
    JwtModule.registerAsync({
      global: true,
      imports: [AppConfigModule],
      useFactory: (configService: AppConfigService) => {
        return {
          signOptions: {
            expiresIn: '10m',
            algorithm: 'RS256',
          },
          verifyOptions: {
            algorithms: ['RS256'],
          },
          secretOrKeyProvider() {
            return configService.JwtPrivateKey.data!;
          },
          secret: configService.JwtPrivateKey.data!,
          privateKey: configService.JwtPrivateKey.data!,
          publicKey: configService.JwtPublicKey.data!,
        };
      },
      inject: [AppConfigService],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        messageKey: 'message',
        mixin(_context, level, logger) {
          return { level_label: logger.levels.labels[level] };
        },
        errorKey: 'error',
        level: process.env.LOG_LEVEL! || 'info',
        base: {
          service: process.env.SERVICE_NAME! || 'temp-api',
          environment: process.env.NODE_ENV,
        },
        timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
        ...(process.env.NODE_ENV !== 'production' && {
          transport: {
            targets: [{ target: 'pino-pretty' }],
          },
        }),
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.x-api-key',
            'res.headers.set-cookie',
            'res.headers["set-cookie"]',
            'token',
            '**.token',
            'accessToken',
            '**.accessToken',
            'refreshToken',
            '**.refreshToken',
            'req.body.secret',
            'req.body.token',
            'req.body.accessToken',
            'req.body.refreshToken',
            'req.headers.cookie',
            'req.query.token',
            'req.cookies',
            'req.cookies.*',
            'password',
            '*.*.password',
            '*.password',
            'email',
            '**.email',
            '**[*].email',
            '**[*].*email',
            '**.password',
            '**[*].password',
            '**[*].*password',
            'secret',
            'apiKey',
          ],
          remove: true,
        },
        genReqId: (req: Request) => {
          return (
            req?.requestId ||
            req.headers['x-request-id'] ||
            req.headers['X-Request-Id'] ||
            uuid()
          );
        },
        autoLogging: {
          ignore: (req) => ['/health', '/metrics'].includes(req.url ?? ''),
        },
      },
      exclude: [
        { path: '/health', method: RequestMethod.GET },
        { path: '/metrics', method: RequestMethod.GET },
      ],
      assignResponse: false,
    }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      imports: [RedisModule],
      inject: [RedisService],
      useFactory: (cache: RedisService) => {
        return {
          throttlers: [
            {
              ttl: 15,
              limit: 30,
              name: 'default',
              blockDuration: 60,
            },
          ],
          errorMessage: 'Too many requests',
          generateKey: (ctx, _, throttlerName) => {
            const req = ctx.switchToHttp().getRequest<Request>();

            const key =
              req?.user?.id || req?.ip || req?.ips?.[0] || 'unknown-ip';

            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            const route = req.route?.path || req.path;

            return `${throttlerName}:${route}:${key}`.toLowerCase();
          },

          storage: {
            async increment(key, ttl, limit, blockDuration) {
              return await cache.ratelimit(key, ttl, limit, blockDuration);
            },
          },
        };
      },
    }),
    AppConfigModule,
    RedisModule,
    DatabaseModule,
    SqsModule,
    HasherModule,
    PolarModule,
    LinksModule,
    S3Module,
    AuthModule,
    SchedulerModule,
    PrometheusModule,
    MetricsModule,
    HealthModule,
    UsersModule,
    WebhooksModule,
    FilesModule,
    SubscriptionsModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
  ],
})
export class AppModule {}
