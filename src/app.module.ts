import { Request } from 'express';

import { Module, RequestMethod } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { LoggerModule } from 'nestjs-pino';

import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { FilesModule } from './modules/files/files.module';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './modules/metrics/metrics.module';
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
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        return {
          signOptions: {
            expiresIn: '10m',
            algorithm: 'RS256',
          },
          verifyOptions: {
            algorithms: ['RS256'],
          },
          secretOrKeyProvider() {
            return configService.get<string>('JWT_PRIVATE_KEY')!;
          },
          secret: configService.get<string>('JWT_SECRET')!,
          privateKey: configService.get<string>('JWT_PRIVATE_KEY')!,
          publicKey: configService.get<string>('JWT_PUBLIC_KEY')!,
        };
      },
      inject: [ConfigService],
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        messageKey: 'message',
        errorKey: 'error',
        level: process.env.LOG_LEVEL! || 'info',
        base: { service: process.env.SERVICE_NAME! },
        timestamp: () => `,"time":"${new Date(Date.now()).toISOString()}"`,
        transport: {
          targets:
            process.env.NODE_ENV !== 'production'
              ? [{ target: 'pino-pretty' }]
              : [
                  {
                    target: 'pino-roll',
                    level: 'info',
                    options: {
                      file: './logs/combined.log',
                      mkdir: true,
                      size: '2m',
                      frequency: 'daily',
                      limit: { count: 1 },
                      dateFormat: 'dd-MM-yyyy',
                    },
                  },
                  {
                    target: 'pino-roll',
                    level: 'error',
                    options: {
                      file: './logs/errors.log',
                      mkdir: true,
                      size: '2m',
                      frequency: 'daily',
                      limit: { count: 1 },
                      dateFormat: 'dd-MM-yyyy',
                    },
                  },
                ],
        },
        redact: {
          paths: [
            'req.headers',
            'req.header',
            'res.headers',
            'res.header',
            'header',
            'req.query.token',
            'req.query',
            'req.params',
            'req.params.*',
            'req.cookies',
            'req.cookies.*',
            'req.body',
            'res.body',
            'res.data',
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
            Date.now().toString()
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
              return await cache.increment(key, ttl, limit, blockDuration);
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
    SqsModule,
    PolarModule,
    S3Module,
    AuthModule,
    PrometheusModule,
    MetricsModule,
    HealthModule,
    UsersModule,
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
