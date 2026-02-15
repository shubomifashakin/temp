import { Request } from 'express';
import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

import { PolarService } from '../../../../../core/polar/polar.service';

@Injectable()
export class PolarWebhookGuard implements CanActivate {
  constructor(private readonly polarService: PolarService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<Request>();

    const { success, data } = this.polarService.validateWebhookEvent(request);

    if (!success) {
      throw new UnauthorizedException();
    }

    const { timestamp, type, data: eventData } = data;

    request.polarEvent = {
      type,
      timestamp,
      data: eventData,
    };

    return true;
  }
}
