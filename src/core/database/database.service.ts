import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaClient } from '../../../generated/prisma/client';

import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleDestroy {
  constructor(private readonly configService: ConfigService) {
    super({
      transactionOptions: { maxWait: 5000, timeout: 15000 },
      adapter: new PrismaPg({
        application_name: 'Temp-Backend',
        connectionString: configService.get<string>('DATABASE_URL'),
      }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
