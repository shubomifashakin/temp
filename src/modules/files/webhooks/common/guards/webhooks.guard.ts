import { Request } from 'express';

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

    const signature = request.headers['x-signature'];

    if (!signature) throw new UnauthorizedException('Missing signature');

    const secret = this.configService.FilesWebhooksSecret;

    if (!secret.success) {
      this.logger.error({
        message: 'Webhooks secret not configured',
        error: secret.error,
      });

      throw new InternalServerErrorException();
    }

    if (secret.data !== signature) {
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }
}
