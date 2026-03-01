import { Request } from 'express';

import { createHmac, timingSafeEqual } from 'node:crypto';

import {
  Logger,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { AppConfigService } from '../../../../../core/app-config/app-config.service';

import { Observable } from 'rxjs';

@Injectable()
export class WebhooksGuard implements CanActivate {
  logger = new Logger(WebhooksGuard.name);

  constructor(private readonly configService: AppConfigService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const rawBody = request.rawBody;

    const incomingSignature = Array.isArray(request.headers['x-signature'])
      ? request.headers['x-signature']?.[0]
      : request.headers['x-signature'];

    if (!incomingSignature) {
      throw new UnauthorizedException('Missing signature');
    }

    if (!rawBody) {
      this.logger.error({
        message: 'Raw body not available',
      });

      throw new InternalServerErrorException();
    }

    const secret = this.configService.FilesWebhooksSecret;

    if (!secret.success) {
      this.logger.error({
        message: 'Webhooks secret not configured',
        error: secret.error,
      });

      throw new InternalServerErrorException();
    }

    const expectedSignature = createHmac('sha256', secret.data)
      .update(rawBody)
      .digest('hex');

    const isValid = timingSafeEqual(
      Buffer.from(expectedSignature),
      Buffer.from(incomingSignature),
    );

    if (!isValid) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
