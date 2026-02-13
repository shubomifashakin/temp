import { IncomingHttpHeaders } from 'http';

import { ConfigService } from '@nestjs/config';
import {
  Logger,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import {
  validateEvent,
  WebhookVerificationError,
} from '@polar-sh/sdk/webhooks';

import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class WebhooksService {
  logger = new Logger(WebhooksService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {}

  handleEvent(dto: any, headers: IncomingHttpHeaders) {
    const polarSecret = this.configService.get<string>('POLAR_WEBHOOK_SECRET');

    if (!polarSecret) {
      throw new InternalServerErrorException();
    }

    //FIXME: IMPLEMENT ERROR FILTER FOR WebhookVerificationError
    const { timestamp, type, data } = validateEvent(
      JSON.stringify(dto),
      headers as Record<string, string>,
      polarSecret,
    );

    // TODO: Handle different webhook types
    switch (type) {
      case 'subscription.created':
        // Handle subscription created
        break;

      case 'subscription.revoked':
        // Handle subscription revoked
        break;

      case 'subscription.active':
        // Handle subscription active
        break;

      case 'subscription.canceled':
        // Handle subscription canceled
        break;

      default:
        this.logger.warn(`Unhandled webhook type: ${type}`);
    }
  }
}
