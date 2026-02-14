import { ConfigService } from '@nestjs/config';
import {
  Logger,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';

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

  async getPolarPlans(cursor?: number) {
    const limit = 10;
    const page = cursor || 1;

    const { success, data, error } =
      await this.polarService.getAvailableProducts({
        page,
        limit,
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

    const transformed = plans.map((c) => {
      const { id, name, prices, description } = c;

      return {
        id,
        name,
        prices,
        description,
      };
    });

    return { hasNextPage, next, data: transformed };
  }

  async createPolarCheckout(userId: string, dto: CreatePolarCheckoutDto) {
    const user = await this.databaseService.user.findUniqueOrThrow({
      where: { id: userId },
    });

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
