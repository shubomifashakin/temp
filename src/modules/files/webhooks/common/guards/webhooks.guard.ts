import { Request } from 'express';

import {
  Logger,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Observable } from 'rxjs';

@Injectable()
export class WebhooksGuard implements CanActivate {
  logger = new Logger(WebhooksGuard.name);

  constructor(private readonly configService: ConfigService) {}

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const signature = request.headers['x-signature'];

    if (!signature) throw new UnauthorizedException('Missing signature');

    const secret = this.configService.get<string>('FILES_WEBHOOKS_SECRET');

    if (!secret) {
      this.logger.error({
        message: 'Webhooks secret not configured',
      });

      throw new InternalServerErrorException();
    }

    if (secret !== signature) {
      throw new UnauthorizedException('Invalid signature');
    }

    return true;
  }
}
