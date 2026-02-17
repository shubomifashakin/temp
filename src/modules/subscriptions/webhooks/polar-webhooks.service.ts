import { ConfigService } from '@nestjs/config';
import {
  Logger,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { Order } from '@polar-sh/sdk/models/components/order';
import { Subscription } from '@polar-sh/sdk/models/components/subscription';
import { EventType } from '@polar-sh/sdk/models/operations/webhookslistwebhookdeliveries';

import { polarProductIdToPlan } from '../common/utils';
import { DatabaseService } from '../../../core/database/database.service';

import { makeError } from '../../../common/utils';
import { FnResult } from '../../../types/common.types';

@Injectable()
export class PolarWebhooksService {
  private readonly logger = new Logger(PolarWebhooksService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {}

  async handleEvent(
    type: EventType,
    data: Subscription | Order,
    timestamp: Date,
  ) {
    const polarSecret = this.configService.get<string>('POLAR_WEBHOOK_SECRET');

    if (!polarSecret) {
      throw new InternalServerErrorException();
    }

    this.logger.log({
      message: 'Polar event received',
      data,
    });

    switch (type) {
      case 'subscription.revoked':
        await this.handleSubscriptionRevoked(data as Subscription, timestamp);
        break;

      case 'subscription.active':
        await this.handleSubscriptionActive(data as Subscription, timestamp);
        break;

      case 'subscription.canceled':
        await this.handleSubscriptionCancelled(data as Subscription, timestamp);
        break;

      case 'subscription.uncanceled':
        await this.handleSubscriptionUncanceled(
          data as Subscription,
          timestamp,
        );
        break;

      case 'order.created':
        await this.handleOrderCreated(data as Order, timestamp);
        break;

      default:
        this.logger.warn(`Unhandled webhook type: ${type as string}`);
    }

    return { message: 'success' };
  }

  private async isOldEvent(
    subscriptionId: string,
    timestamp: Date,
  ): Promise<FnResult<boolean>> {
    try {
      const lastEvent = await this.databaseService.subscription.findUnique({
        where: {
          provider_subscription_id: subscriptionId,
        },
        select: {
          last_event_at: true,
        },
      });

      if (!lastEvent) {
        return { success: true, data: false, error: null };
      }

      return {
        error: null,
        success: true,
        data: lastEvent.last_event_at > timestamp,
      };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  private async handleSubscriptionCancelled(
    data: Subscription,
    timestamp: Date,
  ) {
    const {
      error,
      success,
      data: isOld,
    } = await this.isOldEvent(data.id, timestamp);

    if (!success) {
      this.logger.error({
        error: error,
        message: 'Failed to check if event is old',
      });

      throw new InternalServerErrorException();
    }

    if (success && isOld) {
      this.logger.log({
        message: `This event is old, ${data.id}, ignored.`,
      });

      return;
    }

    const {
      data: details,
      error: mapError,
      success: mapSuccess,
    } = polarProductIdToPlan(data.productId, data.recurringInterval);

    if (!mapSuccess) {
      this.logger.error({
        error: mapError,
        message: 'Failed to map polar product id to a valid plan',
      });

      throw new InternalServerErrorException();
    }

    await this.databaseService.subscription.upsert({
      where: {
        provider_subscription_id: data.id,
      },
      create: {
        user_id: data.metadata.userId as string,
        provider: 'POLAR',
        plan: details.plan,
        amount: data.amount,
        currency: data.currency,
        interval: details.interval,
        product_id: data.productId,
        provider_subscription_id: data.id,
        provider_customer_id: data.customerId,
        interval_count: data.recurringIntervalCount,
        status: data.status === 'active' ? 'ACTIVE' : 'INACTIVE',
        started_at: data.startedAt || new Date(),
        current_period_start: data.currentPeriodStart,
        current_period_end: data.currentPeriodEnd
          ? new Date(data.currentPeriodEnd)
          : null,
        cancel_at_period_end: data.cancelAtPeriodEnd || true,
        cancelled_at: data.canceledAt || new Date(),
        last_event_at: timestamp,
      },
      update: {
        provider: 'POLAR',
        plan: details.plan,
        product_id: data.productId,
        provider_subscription_id: data.id,
        provider_customer_id: data.customerId,
        cancelled_at: data.canceledAt || new Date(),
        cancel_at_period_end: true,
        last_event_at: timestamp,
      },
    });
  }

  private async handleSubscriptionRevoked(data: Subscription, timestamp: Date) {
    const {
      error,
      success,
      data: isOld,
    } = await this.isOldEvent(data.id, timestamp);

    if (!success) {
      this.logger.error({
        error: error,
        message: 'Failed to check if event is old',
      });

      throw new InternalServerErrorException();
    }

    if (success && isOld) {
      this.logger.log({
        message: `This event is old, ${data.id}, ignored.`,
      });

      return;
    }

    const {
      data: details,
      error: mapError,
      success: mapSuccess,
    } = polarProductIdToPlan(data.productId, data.recurringInterval);

    if (!mapSuccess) {
      this.logger.error({
        message: 'Failed to map product id to a valid plan',
        error: mapError,
      });

      throw new InternalServerErrorException();
    }

    await this.databaseService.subscription.upsert({
      where: {
        provider_subscription_id: data.id,
      },
      create: {
        user_id: data.metadata.userId as string,
        provider: 'POLAR',
        plan: details.plan,
        status: 'INACTIVE',
        amount: data.amount,
        currency: data.currency,
        interval: details.interval,
        product_id: data.productId,
        provider_subscription_id: data.id,
        provider_customer_id: data.customerId,
        interval_count: data.recurringIntervalCount,
        started_at: data.startedAt || new Date(),
        current_period_start: data.currentPeriodStart,
        current_period_end: data.currentPeriodEnd
          ? new Date(data.currentPeriodEnd)
          : null,
        cancel_at_period_end: data.cancelAtPeriodEnd || false,
        ended_at: data.endedAt || new Date(),
        last_event_at: timestamp,
      },
      update: {
        status: 'INACTIVE',
        provider: 'POLAR',
        product_id: data.productId,
        ended_at: data.endedAt,
        last_event_at: timestamp,
      },
    });
  }

  private async handleSubscriptionActive(data: Subscription, timestamp: Date) {
    const eventIsOld = await this.isOldEvent(data.id, timestamp);

    if (!eventIsOld.success) {
      this.logger.error({
        error: eventIsOld.error,
        message: 'Failed to check if event is old',
      });

      throw new InternalServerErrorException();
    }

    if (eventIsOld.success && eventIsOld.data) {
      this.logger.log({
        message: `This event is old, ${data.id}, ignored.`,
      });

      return;
    }

    const {
      error,
      success,
      data: details,
    } = polarProductIdToPlan(data.productId, data.recurringInterval);

    if (!success) {
      this.logger.error({
        message: 'Failed to map product id to a valid plan',
        error,
      });

      throw new InternalServerErrorException();
    }

    await this.databaseService.subscription.upsert({
      where: {
        provider_subscription_id: data.id,
      },
      create: {
        status: 'ACTIVE',
        provider: 'POLAR',
        plan: details.plan,
        amount: data.amount,
        currency: data.currency,
        product_id: data.productId,
        interval: details.interval,
        provider_subscription_id: data.id,
        provider_customer_id: data.customerId,
        user_id: data.metadata.userId as string,
        started_at: data.startedAt || new Date(),
        interval_count: data.recurringIntervalCount,
        current_period_start: data.currentPeriodStart,
        current_period_end: data.currentPeriodEnd
          ? new Date(data.currentPeriodEnd)
          : null,
        cancel_at_period_end: data.cancelAtPeriodEnd || false,
        last_event_at: timestamp,
      },
      update: {
        status: 'ACTIVE',
        provider: 'POLAR',
        plan: details.plan,
        amount: data.amount,
        currency: data.currency,
        product_id: data.productId,
        interval: details.interval,
        current_period_end: data.currentPeriodEnd,
        interval_count: data.recurringIntervalCount,
        cancel_at_period_end: data.cancelAtPeriodEnd,
        current_period_start: data.currentPeriodStart,
        last_event_at: timestamp,
      },
    });
  }

  private async handleSubscriptionUncanceled(
    data: Subscription,
    timestamp: Date,
  ) {
    const eventIsOld = await this.isOldEvent(data.id, timestamp);

    if (!eventIsOld.success) {
      this.logger.error({
        error: eventIsOld.error,
        message: 'Failed to check if event is old',
      });

      throw new InternalServerErrorException();
    }

    if (eventIsOld.success && eventIsOld.data) {
      this.logger.log({
        message: `This event is old, ${data.id}, ignored.`,
      });

      return;
    }

    const {
      error,
      success,
      data: details,
    } = polarProductIdToPlan(data.productId, data.recurringInterval);

    if (!success) {
      this.logger.error({
        error,
        message: 'Failed to map product id to a valid plan',
      });

      throw new InternalServerErrorException();
    }

    await this.databaseService.subscription.upsert({
      where: {
        provider_subscription_id: data.id,
      },
      create: {
        status: 'ACTIVE',
        provider: 'POLAR',
        plan: details.plan,
        amount: data.amount,
        currency: data.currency,
        interval: details.interval,
        product_id: data.productId,
        provider_subscription_id: data.id,
        provider_customer_id: data.customerId,
        user_id: data.metadata.userId as string,
        interval_count: data.recurringIntervalCount,
        started_at: data.startedAt || new Date(),
        current_period_start: data.currentPeriodStart,
        current_period_end: data.currentPeriodEnd
          ? new Date(data.currentPeriodEnd)
          : null,
        cancel_at_period_end: data.cancelAtPeriodEnd || false,
        last_event_at: timestamp,
      },
      update: {
        ended_at: null,
        status: 'ACTIVE',
        cancelled_at: null,
        cancel_at_period_end: false,
        last_event_at: timestamp,
      },
    });
  }

  private async handleOrderCreated(data: Order, timestamp: Date) {
    if (!data.subscription) {
      this.logger.log({
        message: 'Non subscription related order event received, skipped',
      });

      return;
    }

    const isSubscriptionRenewal = data.billingReason === 'subscription_cycle';
    const isSubscriptionUpdate = data.billingReason === 'subscription_update';

    const eventIsOld = await this.isOldEvent(data.subscription.id, timestamp);

    if (!eventIsOld.success) {
      this.logger.error({
        error: eventIsOld.error,
        message: 'Failed to check if event is old',
      });

      throw new InternalServerErrorException();
    }

    if (eventIsOld.success && eventIsOld.data) {
      this.logger.log({
        message: `This event is old, ${data.id}, ignored.`,
      });

      return;
    }

    if (
      (!isSubscriptionRenewal && !isSubscriptionUpdate) ||
      data.status !== 'paid'
    ) {
      this.logger.log({
        message: `Skipping order: billingReason=${data.billingReason}, status=${data.status}`,
      });

      return;
    }

    const {
      error,
      success,
      data: details,
    } = polarProductIdToPlan(
      data.subscription.productId,
      data.subscription.recurringInterval,
    );

    if (!success) {
      this.logger.error({
        error,
        message: 'Failed to map product id to a valid plan',
      });

      throw new InternalServerErrorException();
    }

    await this.databaseService.subscription.update({
      where: {
        provider_subscription_id: data.subscription.id,
      },
      data: {
        status: 'ACTIVE',
        plan: details.plan,
        interval: details.interval,
        currency: data.currency || undefined,
        product_id: data.subscription.productId,
        interval_count: data.subscription.recurringIntervalCount,
        cancel_at_period_end: data.subscription.cancelAtPeriodEnd || false,
        amount: data.subscription.amount || data.totalAmount,
        current_period_start: data.subscription.currentPeriodStart
          ? new Date(data.subscription.currentPeriodStart)
          : new Date(),
        current_period_end: data.subscription.currentPeriodEnd
          ? new Date(data.subscription.currentPeriodEnd)
          : null,
        last_event_at: timestamp,
      },
    });

    this.logger.log({
      message:
        `Updated subscription ${data.subscription.id} from order ${data.id}: ` +
        `billingReason=${data.billingReason}, status=${data.status}`,
    });
  }
}
