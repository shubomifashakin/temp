import { Request } from 'express';
import {
  Logger,
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';

import { PolarService } from '../../../../core/polar/polar.service';

@Injectable()
export class PolarWebhookGuard implements CanActivate {
  private readonly logger = new Logger(PolarWebhookGuard.name);

  constructor(private readonly polarService: PolarService) {}

  canActivate(context: ExecutionContext) {
    try {
      const request = context.switchToHttp().getRequest<Request>();

      const { success, data, error } =
        this.polarService.validateWebhookEvent(request);

      if (!success) {
        this.logger.debug({
          reason: error,
          message: 'Polar event failed to be validated',
        });
        throw new UnauthorizedException();
      }

      const { timestamp, type, data: eventData } = data;

      request.polarEvent = {
        type,
        timestamp,
        data: eventData,
      };

      return true;
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.error({
        message: 'Failed to validate polar webhook signature',
        error,
      });

      throw new InternalServerErrorException();
    }
  }
}
