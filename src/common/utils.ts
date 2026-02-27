import { Transform } from 'class-transformer';
import { IsString, IsUrl, IsNotEmpty, validateSync } from 'class-validator';

class EnvConfig {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsUrl({ require_tld: false })
  BASE_URL: string;

  @IsUrl({ require_tld: false })
  FRONTEND_URL: string;

  @IsString()
  @IsNotEmpty()
  DOMAIN: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value.replace(/\n/g, ''))
  JWT_PRIVATE_KEY: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value.replace(/\n/g, ''))
  JWT_PUBLIC_KEY: string;

  @IsString()
  @IsNotEmpty()
  SERVICE_NAME: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_ID: string;

  @IsString()
  @IsNotEmpty()
  GOOGLE_CLIENT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  LOG_LEVEL: string;

  @IsString()
  @IsNotEmpty()
  NODE_ENV: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  @IsString()
  @IsNotEmpty()
  FILES_WEBHOOKS_SECRET: string;

  @IsString()
  @IsNotEmpty()
  POLAR_WEBHOOK_SECRET: string;

  @IsString()
  @IsNotEmpty()
  POLAR_PRODUCT_PRO: string;

  @IsString()
  @IsNotEmpty()
  POLAR_ACCESS_TOKEN: string;

  @IsString()
  @IsNotEmpty()
  POLAR_ORGANIZATION_ID: string;

  @IsUrl({ require_tld: false })
  CHECKOUT_SUCCESS_URL: string;

  @IsUrl({ require_tld: false })
  CHECKOUT_RETURN_URL: string;

  @IsString()
  @IsNotEmpty()
  METRICS_BEARER_TOKEN: string;

  @IsString()
  @IsNotEmpty()
  AWS_ACCESS_KEY: string;

  @IsString()
  @IsNotEmpty()
  AWS_SECRET_KEY: string;

  @IsString()
  @IsNotEmpty()
  AWS_REGION: string;

  @IsString()
  @IsNotEmpty()
  S3_BUCKET_NAME: string;

  @IsUrl()
  SQS_QUEUE_URL: string;

  @IsString()
  @IsNotEmpty()
  @IsUrl()
  CLOUDFRONT_DISTRIBUTION_DOMAIN: string;

  @IsString()
  @IsNotEmpty()
  CLOUDFRONT_PUBLIC_KEY_ID: string;

  @IsString()
  @IsNotEmpty()
  @Transform(({ value }: { value: string }) => value.replace(/\n/g, ''))
  CLOUDFRONT_PRIVATE_KEY: string;
}

export function validateConfig(config: Record<string, string>) {
  const envConfig = new EnvConfig();
  Object.assign(envConfig, config);

  const errors = validateSync(envConfig);

  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.toString()).join(', '));
  }
}

export function makeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === 'string') {
    return new Error(error);
  }

  if (error && typeof error === 'object' && 'message' in error) {
    const err = new Error(String(error.message));
    if ('name' in error && error.name) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      err.name = String(error.name);
    }
    if ('stack' in error && error.stack) {
      // eslint-disable-next-line @typescript-eslint/no-base-to-string
      err.stack = String(error.stack);
    }
    return err;
  }

  return new Error(String(error));
}

export function makeBlacklistedKey(token: string): string {
  return `blacklist:${token}`;
}

export function makeOauthStateKey(token: string): string {
  return `oauth_state:${token}`;
}

export function makeUserKey(userId: string): string {
  return `user:${userId}`;
}
