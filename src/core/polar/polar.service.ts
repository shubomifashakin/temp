import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Polar } from '@polar-sh/sdk';
import { PageIterator } from '@polar-sh/sdk/types/operations';
import { Product } from '@polar-sh/sdk/models/components/product';
import { PolarError } from '@polar-sh/sdk/models/errors/polarerror';
import { ProductsListResponse } from '@polar-sh/sdk/models/operations/productslist';
import { ProductVisibility } from '@polar-sh/sdk/models/components/productvisibility';
import { ProductSortProperty } from '@polar-sh/sdk/models/components/productsortproperty';

import { makeError } from '../../common/utils';
import { FnResult } from '../../types/common.types';

@Injectable()
export class PolarService {
  private readonly polar: Polar;

  constructor(private readonly configService: ConfigService) {
    this.polar = new Polar({
      accessToken: this.configService.getOrThrow('POLAR_ACCESS_TOKEN'),
      server:
        this.configService.getOrThrow('NODE_ENV') === 'production'
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
}
