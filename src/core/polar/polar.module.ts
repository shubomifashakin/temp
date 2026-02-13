import { Module } from '@nestjs/common';

import { PolarService } from './polar.service';

@Module({
  exports: [PolarService],
  providers: [PolarService],
})
export class PolarModule {}
