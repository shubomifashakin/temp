import { Injectable } from '@nestjs/common';

import { PolarEventDto } from './common/dtos/polar-event.dto';

import { DatabaseService } from '../../../core/database/database.service';

@Injectable()
export class WebhooksService {
  constructor(private readonly databaseService: DatabaseService) {}

  handleEvent(dto: PolarEventDto) {
    console.log('Webhook event received');
  }
}
