import {
  Logger,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { Order } from '@polar-sh/sdk/models/components/order';
import { Subscription } from '@polar-sh/sdk/models/components/subscription';
import { EventType } from '@polar-sh/sdk/models/operations/webhookslistwebhookdeliveries';

import { PolarService } from '../../../core/polar/polar.service';
import { DatabaseService } from '../../../core/database/database.service';

import { makeError } from '../../../common/utils';
import { FnResult } from '../../../types/common.types';
import { AppConfigService } from '../../../core/app-config/app-config.service';

@Injectable()
export class PolarWebhooksService {
  private readonly logger = new Logger(PolarWebhooksService.name);

  constructor(
    private readonly configService: AppConfigService,
    private readonly databaseService: DatabaseService,
    private readonly polarService: PolarService,
  ) {}

  async handleEvent(
    type: EventType,
    data: Subscription | Order,
    timestamp: Date,
  ) {
    const polarSecret = this.configService.PolarWebhookSecret.data;

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
          providerSubscriptionId: subscriptionId,
        },
        select: {
          lastEventAt: true,
        },
      });

      if (!lastEvent) {
        return { success: true, data: false, error: null };
      }

      return {
        error: null,
        success: true,
        data: lastEvent.lastEventAt > timestamp,
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
    } = this.polarService.polarProductIdToPlan(
      data.productId,
      data.recurringInterval,
    );

    if (!mapSuccess) {
      this.logger.error({
        error: mapError,
        message: 'Failed to map polar product id to a valid plan',
      });

      throw new InternalServerErrorException();
    }

    await this.databaseService.subscription.upsert({
      where: {
        providerSubscriptionId: data.id,
      },
      create: {
        userId: data.metadata.userId as string,
        provider: 'polar',
        plan: details.plan,
        amount: data.amount,
        currency: data.currency,
        interval: details.interval,
        productId: data.productId,
        providerSubscriptionId: data.id,
        providerCustomerId: data.customerId,
        intervalCount: data.recurringIntervalCount,
        status: data.status === 'active' ? 'active' : 'inactive',
        startedAt: data.startedAt || new Date(),
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd!,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd || true,
        cancelledAt: data.canceledAt || new Date(),
        lastEventAt: timestamp,
      },
      update: {
        provider: 'polar',
        plan: details.plan,
        productId: data.productId,
        providerSubscriptionId: data.id,
        providerCustomerId: data.customerId,
        cancelledAt: data.canceledAt || new Date(),
        cancelAtPeriodEnd: true,
        lastEventAt: timestamp,
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
    } = this.polarService.polarProductIdToPlan(
      data.productId,
      data.recurringInterval,
    );

    if (!mapSuccess) {
      this.logger.error({
        message: 'Failed to map product id to a valid plan',
        error: mapError,
      });

      throw new InternalServerErrorException();
    }

    await this.databaseService.subscription.upsert({
      where: {
        providerSubscriptionId: data.id,
      },
      create: {
        userId: data.metadata.userId as string,
        provider: 'polar',
        plan: details.plan,
        status: 'inactive',
        amount: data.amount,
        currency: data.currency,
        interval: details.interval,
        productId: data.productId,
        providerSubscriptionId: data.id,
        providerCustomerId: data.customerId,
        intervalCount: data.recurringIntervalCount,
        startedAt: data.startedAt || new Date(),
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd!,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd || false,
        endedAt: data.endedAt || new Date(),
        lastEventAt: timestamp,
      },
      update: {
        status: 'inactive',
        provider: 'polar',
        productId: data.productId,
        endedAt: data.endedAt,
        lastEventAt: timestamp,
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
    } = this.polarService.polarProductIdToPlan(
      data.productId,
      data.recurringInterval,
    );

    if (!success) {
      this.logger.error({
        message: 'Failed to map product id to a valid plan',
        error,
      });

      throw new InternalServerErrorException();
    }

    await this.databaseService.subscription.upsert({
      where: {
        providerSubscriptionId: data.id,
      },
      create: {
        status: 'active',
        provider: 'polar',
        plan: details.plan,
        amount: data.amount,
        currency: data.currency,
        productId: data.productId,
        interval: details.interval,
        providerSubscriptionId: data.id,
        providerCustomerId: data.customerId,
        userId: data.metadata.userId as string,
        startedAt: data.startedAt || new Date(),
        intervalCount: data.recurringIntervalCount,
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd!,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd || false,
        lastEventAt: timestamp,
      },
      update: {
        status: 'active',
        provider: 'polar',
        plan: details.plan,
        amount: data.amount,
        currency: data.currency,
        productId: data.productId,
        interval: details.interval,
        currentPeriodEnd: data.currentPeriodEnd!,
        intervalCount: data.recurringIntervalCount,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd,
        currentPeriodStart: data.currentPeriodStart,
        lastEventAt: timestamp,
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
    } = this.polarService.polarProductIdToPlan(
      data.productId,
      data.recurringInterval,
    );

    if (!success) {
      this.logger.error({
        error,
        message: 'Failed to map product id to a valid plan',
      });

      throw new InternalServerErrorException();
    }

    await this.databaseService.subscription.upsert({
      where: {
        providerSubscriptionId: data.id,
      },
      create: {
        status: 'active',
        provider: 'polar',
        plan: details.plan,
        amount: data.amount,
        currency: data.currency,
        interval: details.interval,
        productId: data.productId,
        providerSubscriptionId: data.id,
        providerCustomerId: data.customerId,
        userId: data.metadata.userId as string,
        intervalCount: data.recurringIntervalCount,
        startedAt: data.startedAt || new Date(),
        currentPeriodStart: data.currentPeriodStart,
        currentPeriodEnd: data.currentPeriodEnd!,
        cancelAtPeriodEnd: data.cancelAtPeriodEnd || false,
        lastEventAt: timestamp,
      },
      update: {
        endedAt: null,
        status: 'active',
        cancelledAt: null,
        cancelAtPeriodEnd: false,
        lastEventAt: timestamp,
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
    } = this.polarService.polarProductIdToPlan(
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
        providerSubscriptionId: data.subscription.id,
      },
      data: {
        status: 'active',
        plan: details.plan,
        interval: details.interval,
        currency: data.currency || undefined,
        productId: data.subscription.productId,
        intervalCount: data.subscription.recurringIntervalCount,
        cancelAtPeriodEnd: data.subscription.cancelAtPeriodEnd || false,
        amount: data.subscription.amount || data.totalAmount,
        currentPeriodStart: data.subscription.currentPeriodStart
          ? new Date(data.subscription.currentPeriodStart)
          : new Date(),
        currentPeriodEnd: data.subscription.currentPeriodEnd!,
        lastEventAt: timestamp,
      },
    });

    this.logger.log({
      message:
        `Updated subscription ${data.subscription.id} from order ${data.id}: ` +
        `billingReason=${data.billingReason}, status=${data.status}`,
    });
  }
}
