import {
  Logger,
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { centsToDollars } from './common/utils';
import {
  PlanInfo,
  GetPlansResponse,
} from './common/dtos/get-plans-response.dto';
import { CreateCheckoutDto } from './common/dtos/create-checkout.dto';

import { PolarService } from '../../core/polar/polar.service';
import { DatabaseService } from '../../core/database/database.service';
import { AppConfigService } from '../../core/app-config/app-config.service';

import { FnResult } from '../../types/common.types';
import { makeError } from '../../common/utils';
import { GetSubscriptionResponse } from './common/dtos/get-subscription.dto';
import { CreateCheckoutResponse } from './common/dtos/create-checkout-response.dto';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly polarService: PolarService,
    private readonly configService: AppConfigService,
    private readonly databaseService: DatabaseService,
  ) {}

  private async checkoutWithPolar({
    productId,
    successUrl,
    returnUrl,
    user,
  }: {
    productId: string;
    successUrl: string;
    returnUrl: string;
    user: { id: string; name: string; email: string };
  }): Promise<FnResult<{ url: string } | null>> {
    try {
      const productExists = await this.polarService.getProduct({
        productId,
      });

      if (!productExists.success) {
        this.logger.error({
          message: 'Failed to check if product exists',
          error: productExists.error,
        });

        throw new InternalServerErrorException();
      }

      if (productExists.success && !productExists.data) {
        this.logger.warn({
          message: `Product with id: ${productId} does not exist`,
        });

        return {
          data: null,
          error: null,
          success: true,
        };
      }

      const result = await this.polarService.createCheckout({
        productId,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        successUrl,
        returnUrl,
      });

      return result;
    } catch (error) {
      return { success: false, error: makeError(error), data: null };
    }
  }

  async getSubscriptionDetails(
    userId: string,
  ): Promise<GetSubscriptionResponse> {
    const subscription = await this.databaseService.subscription.findFirst({
      where: {
        userId: userId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        plan: true,
        status: true,
        amount: true,
        currency: true,
        provider: true,
        cancelledAt: true,
        currentPeriodEnd: true,
        currentPeriodStart: true,
        cancelAtPeriodEnd: true,
        providerSubscriptionId: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return { data: subscription };
  }

  async cancelSubscription(userId: string) {
    const subscription = await this.databaseService.subscription.findFirst({
      where: {
        userId: userId,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        status: true,
        provider: true,
        cancelledAt: true,
        cancelAtPeriodEnd: true,
        providerSubscriptionId: true,
      },
      orderBy: {
        lastEventAt: 'desc',
      },
    });

    if (
      !subscription ||
      subscription.status !== 'ACTIVE' ||
      subscription.cancelAtPeriodEnd
    ) {
      return { message: 'success' };
    }

    if (subscription.provider === 'POLAR') {
      const { success, error } = await this.polarService.cancelSubscription({
        cancel: true,
        id: subscription.providerSubscriptionId,
      });

      if (!success) {
        this.logger.error({
          error,
          message: 'Failed to cancel customers polar subscription',
        });

        throw new InternalServerErrorException();
      }
    }

    await this.databaseService.subscription.update({
      where: {
        id: subscription.id,
      },
      data: {
        cancelAtPeriodEnd: true,
      },
    });

    return { message: 'success' };
  }

  async getPlans(): Promise<GetPlansResponse> {
    const limit = 10;

    const polarOrganizationId = this.configService.PolarOrganizationId;

    if (!polarOrganizationId.success) {
      this.logger.error({
        error: polarOrganizationId.error,
        message: 'Failed to fetch polar organization id',
      });

      throw new InternalServerErrorException();
    }

    const { success, data, error } =
      await this.polarService.getAvailableProducts({
        page: 1,
        limit,
        isRecurring: true,
        visibility: ['public'],
        sorting: ['price_amount'],
        organizationId: polarOrganizationId.data,
      });

    if (!success || !data?.result?.items) {
      this.logger.error({
        error,
        message: 'Failed to fetch available plans',
      });

      throw new InternalServerErrorException();
    }

    const products = data.result.items;

    for (const product of products) {
      if (!product.isRecurring || !product.recurringInterval) {
        this.logger.error({
          message: 'Products fetched are not subscription based products',
        });

        throw new InternalServerErrorException();
      }

      const productInfo = this.polarService.polarProductIdToPlan(
        product.id,
        product.recurringInterval,
      );

      if (!productInfo.success) {
        this.logger.error({
          error: productInfo.error,
          message: `Failed to map product:${product.id} to plan`,
        });
      }
    }

    const transformedPolarPlans = products.map((plan) => {
      const { id, prices, recurringInterval } = plan;

      const allFixedPrices = prices.filter((p) => p.amountType === 'fixed');
      const amountInCents = allFixedPrices[0].priceAmount;
      const currency = allFixedPrices[0].priceCurrency;

      const productInfo = this.polarService.polarProductIdToPlan(
        id,
        recurringInterval!,
      );

      return {
        amount: centsToDollars(amountInCents),
        currency,
        productId: id,
        name: productInfo.data!.plan,
        benefits: productInfo.data!.benefits,
        interval: productInfo.data!.interval,
      };
    });

    const polarPlanCycles = transformedPolarPlans.reduce(
      (acc, plan) => {
        if (plan.interval === 'MONTH') {
          acc.month.push({ plans: [plan], currency: 'usd', provider: 'POLAR' });
        } else {
          acc.year.push({ plans: [plan], currency: 'usd', provider: 'POLAR' });
        }
        return acc;
      },
      { month: [] as PlanInfo[], year: [] as PlanInfo[] },
    );

    return {
      data: { month: polarPlanCycles.month, year: polarPlanCycles.year },
    };
  }

  async createCheckout(
    userId: string,
    dto: CreateCheckoutDto,
  ): Promise<CreateCheckoutResponse> {
    const user = await this.databaseService.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const hasActiveSubscription =
      await this.databaseService.subscription.findFirst({
        where: {
          status: 'ACTIVE',
          userId: userId,
        },
        orderBy: {
          lastEventAt: 'desc',
        },
      });

    if (hasActiveSubscription) {
      throw new BadRequestException('User already has an active subscription');
    }

    const returnUrl = this.configService.CheckoutReturnUrl.data!;
    const successUrl = this.configService.CheckoutSuccessUrl.data!;

    if (!returnUrl || !successUrl) {
      this.logger.error({
        message: 'Checkout return URL or success URL is not configured',
        error: new Error(
          'Checkout return URL or success URL is not configured',
        ),
      });

      throw new InternalServerErrorException();
    }

    let result: FnResult<{ url: string } | null> = {
      success: false,
      data: null,
      error: new Error('Invalid provider'),
    };

    if (dto.provider === 'POLAR') {
      result = await this.checkoutWithPolar({
        productId: dto.productId,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        successUrl,
        returnUrl,
      });
    }

    if (!result.success) {
      this.logger.error({
        error: result.error,
        message: `Failed to generate ${dto.provider} checkout session`,
      });

      throw new InternalServerErrorException();
    }

    if (result.success && !result.data) {
      throw new NotFoundException('product does not exist');
    }

    return { url: result.data!.url };
  }
}
