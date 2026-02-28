import { Injectable, OnModuleDestroy } from '@nestjs/common';

import { PrismaClient } from '../../../generated/prisma/client';

import { PrismaPg } from '@prisma/adapter-pg';
import { AppConfigService } from '../app-config/app-config.service';

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleDestroy {
  constructor(private readonly configService: AppConfigService) {
    if (!configService.DatabaseUrl.success) {
      throw new Error('Database URL not found');
    }

    super({
      transactionOptions: { maxWait: 5000, timeout: 15000 },
      adapter: new PrismaPg({
        application_name: configService.ServiceName.data!,
        connectionString: configService.DatabaseUrl.data,
      }),
    });
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
