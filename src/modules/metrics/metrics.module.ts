import { Module } from '@nestjs/common';

import { MetricsController } from './metrics.controller';

import { PrometheusModule } from '../../core/prometheus/prometheus.module';

@Module({
  controllers: [MetricsController],
  imports: [PrometheusModule],
})
export class MetricsModule {}
