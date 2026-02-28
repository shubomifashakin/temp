import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FnResult } from '../../types/common.types';
import { makeError } from '../../common/utils';

@Injectable()
export class AppConfigService {
  constructor(private readonly configService: ConfigService) {}

  get DatabaseUrl(): FnResult<string> {
    try {
      const url = this.configService.getOrThrow<string>('DATABASE_URL');

      return { success: true, data: url, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get RedisUrl(): FnResult<string> {
    try {
      const url = this.configService.getOrThrow<string>('REDIS_URL');

      return { success: true, data: url, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get CloudfrontPublicKeyId(): FnResult<string> {
    try {
      const id = this.configService.getOrThrow<string>(
        'CLOUDFRONT_PUBLIC_KEY_ID',
      );

      return { success: true, data: id, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get CloudfrontPrivateKey(): FnResult<string> {
    try {
      const key = this.configService.getOrThrow<string>(
        'CLOUDFRONT_PRIVATE_KEY',
      );

      return { success: true, data: key, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get CloudfrontDomainName(): FnResult<string> {
    try {
      const domain = this.configService.getOrThrow<string>(
        'CLOUDFRONT_DISTRIBUTION_DOMAIN',
      );

      return { success: true, data: domain, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get NodeEnv(): FnResult<string> {
    try {
      const env = this.configService.get<string>('NODE_ENV', 'development');

      return { success: true, data: env, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get ServiceName(): FnResult<string> {
    try {
      const name = this.configService.getOrThrow<string>('SERVICE_NAME');

      return { success: true, data: name, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get BaseUrl(): FnResult<string> {
    try {
      const url = this.configService.getOrThrow<string>('BASE_URL');

      return { success: true, data: url, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get FrontendUrl(): FnResult<string> {
    try {
      const url = this.configService.getOrThrow<string>('FRONTEND_URL');

      return { success: true, data: url, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get LogLevel(): FnResult<string> {
    try {
      const level = this.configService.get<string>('LOG_LEVEL', 'info');

      return { success: true, data: level, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get UploadPresignedPostUrlTtlSeconds(): FnResult<number> {
    try {
      const ttl = this.configService.getOrThrow<number>(
        'UPLOAD_PRESIGNED_POST_URL_TTL_SECONDS',
      );

      return { success: true, data: ttl, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get LinksPresignedGetUrlTtlSeconds(): FnResult<number> {
    try {
      const ttl = this.configService.getOrThrow<number>(
        'LINKS_PRESIGNED_GET_URL_TTL_SECONDS',
      );

      return { success: true, data: ttl, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get GoogleClientId(): FnResult<string> {
    try {
      const id = this.configService.getOrThrow<string>('GOOGLE_CLIENT_ID');

      return { success: true, data: id, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get GoogleClientSecret(): FnResult<string> {
    try {
      const secret = this.configService.getOrThrow<string>(
        'GOOGLE_CLIENT_SECRET',
      );

      return { success: true, data: secret, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get Domain(): FnResult<string> {
    try {
      const domain = this.configService.getOrThrow<string>('DOMAIN');

      return { success: true, data: domain, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get JwtPrivateKey(): FnResult<string> {
    try {
      const key = this.configService.getOrThrow<string>('JWT_PRIVATE_KEY');

      return { success: true, data: key, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get JwtPublicKey(): FnResult<string> {
    try {
      const key = this.configService.getOrThrow<string>('JWT_PUBLIC_KEY');

      return { success: true, data: key, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get AwsRegion(): FnResult<string> {
    try {
      const region = this.configService.getOrThrow<string>('AWS_REGION');

      return { success: true, data: region, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get S3BucketName(): FnResult<string> {
    try {
      const bucket = this.configService.getOrThrow<string>('S3_BUCKET_NAME');

      return { success: true, data: bucket, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get SqsQueueUrl(): FnResult<string> {
    try {
      const url = this.configService.getOrThrow<string>('SQS_QUEUE_URL');

      return { success: true, data: url, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get AwsSecretKey(): FnResult<string> {
    try {
      const key = this.configService.getOrThrow<string>('AWS_SECRET_KEY');

      return { success: true, data: key, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get AwsAccessKey(): FnResult<string> {
    try {
      const key = this.configService.getOrThrow<string>('AWS_ACCESS_KEY');

      return { success: true, data: key, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get MetricsBearerToken(): FnResult<string> {
    try {
      const token = this.configService.getOrThrow<string>(
        'METRICS_BEARER_TOKEN',
      );

      return { success: true, data: token, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get FilesWebhooksSecret(): FnResult<string> {
    try {
      const secret = this.configService.getOrThrow<string>(
        'FILES_WEBHOOKS_SECRET',
      );

      return { success: true, data: secret, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get PolarWebhookSecret(): FnResult<string> {
    try {
      const secret = this.configService.getOrThrow<string>(
        'POLAR_WEBHOOK_SECRET',
      );

      return { success: true, data: secret, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get PolarProductIdPro(): FnResult<string> {
    try {
      const productId =
        this.configService.getOrThrow<string>('POLAR_PRODUCT_PRO');

      return { success: true, data: productId, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get PolarAccessToken(): FnResult<string> {
    try {
      const token = this.configService.getOrThrow<string>('POLAR_ACCESS_TOKEN');

      return { success: true, data: token, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get PolarOrganizationId(): FnResult<string> {
    try {
      const orgId = this.configService.getOrThrow<string>(
        'POLAR_ORGANIZATION_ID',
      );

      return { success: true, data: orgId, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get CheckoutReturnUrl(): FnResult<string> {
    try {
      const url = this.configService.getOrThrow<string>('CHECKOUT_RETURN_URL');

      return { success: true, data: url, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  get CheckoutSuccessUrl(): FnResult<string> {
    try {
      const url = this.configService.getOrThrow<string>('CHECKOUT_SUCCESS_URL');

      return { success: true, data: url, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }
}
