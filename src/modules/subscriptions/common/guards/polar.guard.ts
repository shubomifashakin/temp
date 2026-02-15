import { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  InternalServerErrorException,
} from '@nestjs/common';

import { validateEvent } from '@polar-sh/sdk/webhooks';
import { Order } from '@polar-sh/sdk/models/components/order.js';
import { Subscription } from '@polar-sh/sdk/models/components/subscription.js';

@Injectable()
export class PolarGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();
    const polarSecret = this.configService.get<string>('POLAR_WEBHOOK_SECRET');

    if (!polarSecret) {
      throw new InternalServerErrorException();
    }

    const { type, data, timestamp } = validateEvent(
      JSON.stringify(request.body),
      request.headers as Record<string, string>,
      polarSecret,
    );

    request.polarEvent = {
      type,
      data: data as Order | Subscription,
      timestamp,
    };

    return true;
  }
}
