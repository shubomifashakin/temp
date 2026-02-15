import { ConfigService } from '@nestjs/config';
import {
  Logger,
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { centsToDollars, polarProductIdToPlan } from './common/utils';
import { PolarPlanResponseDto } from './common/dtos/polar-plans-response.dto';
import { CreatePolarCheckoutDto } from './common/dtos/create-polar-checkout.dto';

import { PolarService } from '../../core/polar/polar.service';
import { DatabaseService } from '../../core/database/database.service';

@Injectable()
export class SubscriptionsService {
  logger = new Logger(SubscriptionsService.name);

  constructor(
    private readonly polarService: PolarService,
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
  ) {}

  async cancelSubscription(userId: string) {
    const subscription = await this.databaseService.subscription.findFirst({
      where: {
        user_id: userId,
        status: 'ACTIVE',
      },
      select: {
        status: true,
        provider: true,
        cancelled_at: true,
        cancel_at_period_end: true,
        provider_subscription_id: true,
      },
      orderBy: {
        last_event_at: 'desc',
      },
    });

    if (
      !subscription ||
      subscription.status !== 'ACTIVE' ||
      subscription.cancel_at_period_end
    ) {
      return { message: 'success' };
    }

    if (subscription.provider === 'POLAR') {
      const { success, error } = await this.polarService.cancelSubscription({
        cancel: true,
        id: subscription.provider_subscription_id,
      });

      if (!success) {
        this.logger.error({
          error,
          message: 'Failed to cancel customers polar subscription',
        });

        throw new InternalServerErrorException();
      }
    }

    return { message: 'success' };
  }

  async getPolarPlans(cursor?: number): Promise<PolarPlanResponseDto> {
    const limit = 10;
    const page = cursor || 1;

    const { success, data, error } =
      await this.polarService.getAvailableProducts({
        page,
        limit,
        isRecurring: true,
        visibility: ['public'],
        sorting: ['price_amount'],
        organizationId: this.configService.getOrThrow('POLAR_ORGANIZATION_ID'),
      });

    if (!success || !data?.result?.items) {
      this.logger.error({
        error,
        message: 'Failed to fetch available plans',
      });

      throw new InternalServerErrorException();
    }

    const hasNextPage = data.result.pagination.maxPage > page;
    const next = hasNextPage ? page + 1 : null;
    const products = data.result.items;

    for (const product of products) {
      if (!product.isRecurring || !product.recurringInterval) {
        this.logger.error({
          message: 'Products fetched are not subscription based products',
        });

        throw new InternalServerErrorException();
      }

      const productInfo = polarProductIdToPlan(
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

    const transformed = products.map((plan) => {
      const { id, prices, recurringInterval } = plan;

      const allFixedPrices = prices.filter((p) => p.amountType === 'fixed');
      const amountInCents = allFixedPrices[0].priceAmount;
      const currency = allFixedPrices[0].priceCurrency;

      const productInfo = polarProductIdToPlan(id, recurringInterval!);

      return {
        id,
        currency,
        name: productInfo.data!.plan,
        benefits: productInfo.data!.benefits,
        interval: productInfo.data!.interval,
        amountInCents,
        amountInDollars: centsToDollars(amountInCents),
      };
    });

    return { hasNextPage, cursor: next, data: transformed };
  }

  async createPolarCheckout(userId: string, dto: CreatePolarCheckoutDto) {
    const user = await this.databaseService.user.findUniqueOrThrow({
      where: { id: userId },
    });

    const hasActiveSubscription =
      await this.databaseService.subscription.findFirst({
        where: {
          status: 'ACTIVE',
          user_id: userId,
        },
        orderBy: {
          last_event_at: 'desc',
        },
      });

    if (hasActiveSubscription) {
      throw new BadRequestException('User already has an active subscription');
    }

    const returnUrl = this.configService.get<string>('CHECKOUT_RETURN_URL');
    const successUrl = this.configService.get<string>('CHECKOUT_SUCCESS_URL');

    if (!returnUrl || !successUrl) {
      this.logger.error({
        message: 'Checkout return URL or success URL is not configured',
        error: new Error(
          'Checkout return URL or success URL is not configured',
        ),
      });

      throw new InternalServerErrorException();
    }

    const productExists = await this.polarService.getProduct({
      productId: dto.productId,
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
        message: `Product with id: ${dto.productId} does not exist`,
      });

      throw new NotFoundException('Product does not exist');
    }

    const { success, data, error } = await this.polarService.createCheckout({
      productId: dto.productId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      successUrl,
      returnUrl,
    });

    if (!success || !data?.url) {
      this.logger.error({
        error,
        message: 'Failed to generate checkout session',
      });

      throw new InternalServerErrorException();
    }

    return { url: data.url };
  }
}
