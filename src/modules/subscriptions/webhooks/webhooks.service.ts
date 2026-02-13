import { IncomingHttpHeaders } from 'http';

import { ConfigService } from '@nestjs/config';
import {
  Logger,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { validateEvent } from '@polar-sh/sdk/webhooks';

import { DatabaseService } from '../../../core/database/database.service';
import { Subscription } from '@polar-sh/sdk/models/components/subscription';
import {
  Plan,
  BillingInterval,
  SubscriptionStatus as DbSubscriptionStatus,
} from '../../../../generated/prisma/enums';

import { availablePolarPlans } from '../common/constants';

import { Order } from '@polar-sh/sdk/models/components/order';
import { SubscriptionStatus } from '@polar-sh/sdk/models/components/subscriptionstatus';
import { SubscriptionRecurringInterval } from '@polar-sh/sdk/models/components/subscriptionrecurringinterval';

@Injectable()
export class WebhooksService {
  logger = new Logger(WebhooksService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {}

  private getStatus(status: SubscriptionStatus) {
    switch (status) {
      case SubscriptionStatus.Active:
        return DbSubscriptionStatus.ACTIVE;

      case SubscriptionStatus.Canceled:
        return DbSubscriptionStatus.CANCELED;

      case SubscriptionStatus.Trialing:
        return DbSubscriptionStatus.TRIALING;

      case SubscriptionStatus.Incomplete:
        return DbSubscriptionStatus.INCOMPLETE;

      case SubscriptionStatus.IncompleteExpired:
        return DbSubscriptionStatus.INCOMPLETE_EXPIRED;

      default:
        return DbSubscriptionStatus.ENDED;
    }
  }

  private getInterval(interval: SubscriptionRecurringInterval) {
    switch (interval) {
      case SubscriptionRecurringInterval.Day:
        return BillingInterval.DAY;
      case SubscriptionRecurringInterval.Week:
        return BillingInterval.WEEK;
      case SubscriptionRecurringInterval.Month:
        return BillingInterval.MONTH;
      case SubscriptionRecurringInterval.Year:
        return BillingInterval.YEAR;
      default:
        return BillingInterval.MONTH;
    }
  }

  private getPlanTier(productId: string): Plan {
    const plan = availablePolarPlans[productId];

    return plan?.plan || Plan.FREE;
  }

  async handleEvent(dto: any, headers: IncomingHttpHeaders) {
    const polarSecret = this.configService.get<string>('POLAR_WEBHOOK_SECRET');

    if (!polarSecret) {
      throw new InternalServerErrorException();
    }

    //FIXME: IMPLEMENT ERROR FILTER FOR WebhookVerificationError
    const { type, data } = validateEvent(
      JSON.stringify(dto),
      headers as Record<string, string>,
      polarSecret,
    );

    switch (type) {
      // case 'subscription.created':
      //   await this.handleSubscriptionCreated(data);
      //   break;

      case 'subscription.revoked':
        await this.handleSubscriptionRevoked(data);
        break;

      case 'subscription.active':
        await this.handleSubscriptionActive(data);
        break;

      case 'subscription.canceled':
        await this.handleSubscriptionCancelled(data);
        break;

      case 'subscription.uncanceled':
        await this.handleSubscriptionUncanceled(data);
        break;

      case 'order.created':
        await this.handleOrderCreated(data);
        break;

      default:
        this.logger.warn(`Unhandled webhook type: ${type}`);
    }
  }

  // private async handleSubscriptionCreated(data: Subscription) {
  //   const subscriptionStatus = this.getStatus(data.status);

  //   if (subscriptionStatus !== 'ACTIVE') return;

  //   await this.databaseService.subscription.create({
  //     data: {
  //       user_id: data.metadata.user_id as string,
  //       provider: 'POLAR',
  //       provider_subscription_id: data.id,
  //       provider_customer_id: data.customerId,
  //       product_id: data.productId,
  //       plan_name: data.product?.name,
  //       plan: this.getPlanTier(data.productId),
  //       amount: new Decimal(data.amount),
  //       currency: data.currency,
  //       interval_count: data.recurringIntervalCount,
  //       interval: this.getInterval(data.recurringInterval),
  //       status: this.getStatus(data.status),
  //       started_at: data.startedAt || new Date(),
  //       current_period_start: data.currentPeriodStart || new Date(),
  //       current_period_end: data.currentPeriodEnd
  //         ? new Date(data.currentPeriodEnd)
  //         : null,
  //       cancel_at_period_end: data.cancelAtPeriodEnd || false,
  //     },
  //   });
  // }

  private async handleSubscriptionCancelled(data: Subscription) {
    await this.databaseService.subscription.update({
      where: {
        provider_subscription_id: data.id,
      },
      data: {
        status: this.getStatus(data.status),
        cancelled_at: data.canceledAt || new Date(),
        cancel_at_period_end: true,
      },
    });
  }

  private async handleSubscriptionRevoked(data: Subscription) {
    await this.databaseService.subscription.update({
      where: {
        provider_subscription_id: data.id,
      },
      data: {
        status: 'ENDED',
        ended_at: new Date(),
      },
    });
  }

  //   private async handleSubscriptionActive(data: Subscription) {
  //   await this.databaseService.subscription.update({
  //     where: {
  //       provider_subscription_id: data.id,
  //     },
  //     data: {
  //       status: this.getStatus(data.status),
  //       started_at: data.startedAt || new Date(),
  //       current_period_start: data.currentPeriodStart || new Date(),
  //       current_period_end: data.currentPeriodEnd
  //         ? new Date(data.currentPeriodEnd)
  //         : null,
  //       cancel_at_period_end: false,
  //     },
  //   });
  // }

  private async handleSubscriptionActive(data: Subscription) {
    await this.databaseService.subscription.create({
      data: {
        user_id: data.metadata.user_id as string,
        provider: 'POLAR',
        provider_subscription_id: data.id,
        provider_customer_id: data.customerId,
        product_id: data.productId,
        plan_name: data.product?.name,
        plan: this.getPlanTier(data.productId),
        amount: data.amount,
        currency: data.currency,
        interval_count: data.recurringIntervalCount,
        interval: this.getInterval(data.recurringInterval),
        status: this.getStatus(data.status),
        started_at: data.startedAt || new Date(),
        current_period_start: data.currentPeriodStart || new Date(),
        current_period_end: data.currentPeriodEnd
          ? new Date(data.currentPeriodEnd)
          : null,
        cancel_at_period_end: data.cancelAtPeriodEnd || false,
      },
    });
  }

  private async handleSubscriptionUncanceled(data: Subscription) {
    await this.databaseService.subscription.update({
      where: {
        provider_subscription_id: data.id,
      },
      data: {
        status: 'ACTIVE',
        cancelled_at: null,
        cancel_at_period_end: false,
        ended_at: null,
      },
    });
  }

  private async handleOrderCreated(data: Order) {
    if (!data.subscription) {
      this.logger.log({
        message: 'Non subscription related order event received, skipped',
      });

      return;
    }

    const isSubscriptionRenewal = data.billingReason === 'subscription_cycle';
    const isSubscriptionUpdate = data.billingReason === 'subscription_update';

    if (
      (!isSubscriptionRenewal && !isSubscriptionUpdate) ||
      data.status !== 'paid'
    ) {
      this.logger.log({
        message: `Skipping order: billingReason=${data.billingReason}, status=${data.status}`,
      });

      return;
    }

    await this.databaseService.subscription.update({
      where: {
        provider_subscription_id: data.subscription.id,
      },
      data: {
        status: this.getStatus(data.subscription.status),
        interval: this.getInterval(data.subscription.recurringInterval),
        interval_count: data.subscription.recurringIntervalCount,
        current_period_start: data.subscription.currentPeriodStart
          ? new Date(data.subscription.currentPeriodStart)
          : new Date(),
        current_period_end: data.subscription.currentPeriodEnd
          ? new Date(data.subscription.currentPeriodEnd)
          : null,
        cancel_at_period_end: data.subscription.cancelAtPeriodEnd || false,

        amount: data.subscription.amount ? data.subscription.amount : undefined,
        currency: data.currency || undefined,

        product_id: data.subscription.productId,
        plan: this.getPlanTier(data.subscription.productId),
      },
    });

    this.logger.log({
      message:
        `Updated subscription ${data.subscription.id} from order ${data.id}: ` +
        `billingReason=${data.billingReason}, status=${data.status}`,
    });
  }
}
