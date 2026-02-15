import { ConfigService } from '@nestjs/config';
import {
  Logger,
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';

import { polarProductIdToPlan } from './common/utils';
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
    const subscription = await this.databaseService.subscription.findUnique({
      where: {
        user_id: userId,
      },
      select: {
        status: true,
        provider: true,
        provider_subscription_id: true,
      },
    });

    if (!subscription) {
      return { message: 'success' };
    }

    if (subscription.status !== 'ACTIVE') {
      return { message: 'success' };
    }

    if (subscription.provider === 'POLAR') {
      //FIXME: CONFIRM IF THIS TRIGGERS THE CANCELLED EVENT
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
    const plans = data.result.items;

    const transformed = plans.map((plan) => {
      const { id, prices, recurringInterval } = plan;

      const allFixedPrices = prices.filter(
        (price) => price.amountType === 'fixed',
      );

      const amount = allFixedPrices[0].priceAmount;
      const currency = allFixedPrices[0].priceCurrency;

      const productInfo = polarProductIdToPlan(id, recurringInterval!);

      if (!productInfo.success) {
        this.logger.error({
          error: productInfo.error,
          message: 'Failed to get plan for product',
        });

        throw new InternalServerErrorException();
      }

      return {
        id,
        amount,
        currency,
        name: productInfo.data.plan,
        benefits: productInfo.data.benefits,
        interval: productInfo.data.interval,
      };
    });

    return { hasNextPage, cursor: next, data: transformed };
  }

  async createPolarCheckout(userId: string, dto: CreatePolarCheckoutDto) {
    const user = await this.databaseService.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        subscriptions: {
          select: {
            status: true,
          },
        },
      },
    });

    if (user.subscriptions && user.subscriptions.status === 'ACTIVE') {
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
