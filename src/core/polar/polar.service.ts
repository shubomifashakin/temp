import { Request } from 'express';
import {
  Logger,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { Polar } from '@polar-sh/sdk';
import { validateEvent } from '@polar-sh/sdk/webhooks';
import { PageIterator } from '@polar-sh/sdk/types/operations';
import { Order } from '@polar-sh/sdk/models/components/order';
import { Product } from '@polar-sh/sdk/models/components/product';
import { PolarError } from '@polar-sh/sdk/models/errors/polarerror';
import { Subscription } from '@polar-sh/sdk/models/components/subscription';
import { ProductsListResponse } from '@polar-sh/sdk/models/operations/productslist';
import { ProductVisibility } from '@polar-sh/sdk/models/components/productvisibility';
import { ProductSortProperty } from '@polar-sh/sdk/models/components/productsortproperty';
import { EventType } from '@polar-sh/sdk/models/operations/webhookslistwebhookdeliveries';

import { makeError } from '../../common/utils';
import { FnResult } from '../../types/common.types';
import { SubscriptionRecurringInterval } from '@polar-sh/sdk/models/components/subscriptionrecurringinterval';

import { AppConfigService } from '../app-config/app-config.service';
import { BillingInterval, Plan } from '../../../generated/prisma/enums';
import { benefits, mappedPolarIntervals } from '../../common/constants';

@Injectable()
export class PolarService {
  private readonly polar: Polar;
  private readonly logger = new Logger(PolarService.name);

  constructor(private readonly configService: AppConfigService) {
    if (!configService.PolarAccessToken.success) {
      throw new Error('Polar access token not found');
    }

    this.polar = new Polar({
      accessToken: this.configService.PolarAccessToken.data!,
      server:
        this.configService.NodeEnv.data === 'production'
          ? 'production'
          : 'sandbox',
    });
  }

  async getAvailableProducts({
    organizationId,
    limit,
    sorting,
    page,
    visibility,
    isRecurring,
  }: {
    organizationId: string;
    limit?: number;
    page?: number;
    sorting: ProductSortProperty[];
    visibility: ProductVisibility[];
    isRecurring: boolean;
  }): Promise<
    FnResult<
      PageIterator<
        ProductsListResponse,
        {
          page: number;
        }
      >
    >
  > {
    try {
      const products = await this.polar.products.list({
        organizationId,
        limit,
        sorting,
        page,
        visibility,
        isRecurring,
      });

      return { success: true, data: products, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  async getProduct({
    productId,
  }: {
    productId: string;
  }): Promise<FnResult<Product | null>> {
    try {
      const product = await this.polar.products.get({ id: productId });

      return { success: true, data: product, error: null };
    } catch (error) {
      if (error instanceof PolarError) {
        if (error.statusCode === 404) {
          return { success: true, data: null, error: null };
        }

        return { success: false, data: null, error: makeError(error) };
      }

      return { success: false, data: null, error: makeError(error) };
    }
  }

  async createCheckout({
    productId,
    user,
    successUrl,
    returnUrl,
  }: {
    productId: string;
    successUrl: string;
    returnUrl: string;
    user: { name: string; id: string; email: string };
  }): Promise<FnResult<{ url: string }>> {
    try {
      const res = await this.polar.checkouts.create({
        products: [productId],
        metadata: {
          userId: user.id,
        },
        customerEmail: user.email,
        customerName: user.name,
        customerMetadata: {
          userId: user.id,
        },
        successUrl,
        returnUrl,
      });

      return { success: true, data: { url: res.url }, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  async cancelSubscription({
    id,
    cancel,
  }: {
    id: string;
    cancel: boolean;
  }): Promise<FnResult<null>> {
    try {
      await this.polar.subscriptions.update({
        id,
        subscriptionUpdate: {
          cancelAtPeriodEnd: cancel,
        },
      });

      return { success: true, data: null, error: null };
    } catch (error) {
      return { success: false, error: makeError(error), data: null };
    }
  }

  validateWebhookEvent(request: Request): FnResult<{
    timestamp: Date;
    type: EventType;
    data: Order | Subscription;
  }> {
    try {
      const polarSecret = this.configService.PolarWebhookSecret.data;

      if (!polarSecret) {
        this.logger.error({
          error: new Error('Polar webhooke secret is not set'),
          message: 'Polar webhook secret is absent',
        });

        throw new InternalServerErrorException();
      }

      const { type, data, timestamp } = validateEvent(
        JSON.stringify(request.body),
        request.headers as Record<string, string>,
        polarSecret,
      );

      return {
        success: true,
        error: null,
        data: { timestamp, type, data: data as Order | Subscription },
      };
    } catch (error) {
      return { success: false, error: makeError(error), data: null };
    }
  }

  polarProductIdToPlan(
    productId: string,
    interval: SubscriptionRecurringInterval,
  ): FnResult<{ plan: Plan; benefits: string[]; interval: BillingInterval }> {
    const polarProId = this.configService.PolarProductIdPro.data;

    const allPlanIds = [{ name: 'pro', id: polarProId }];

    const missingPlan = allPlanIds.find(
      (plan) => typeof plan.id === 'undefined' || plan.id === null,
    );

    if (missingPlan) {
      return {
        success: false,
        error: new Error(
          `Polar ${missingPlan.name.toUpperCase()} ProductId Not Set In Env`,
        ),
        data: null,
      };
    }

    const plans = {
      [polarProId!]: {
        plan: Plan.PRO,
        benefits: benefits[Plan.PRO],
        interval: mappedPolarIntervals[interval],
      },
    };

    const selectedPlan = plans[productId];

    if (!selectedPlan) {
      return {
        success: false,
        error: new Error(
          `Plan does not exist for Polar product with id:${productId}`,
        ),
        data: null,
      };
    }

    return { success: true, data: selectedPlan, error: null };
  }
}
