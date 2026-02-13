import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Polar } from '@polar-sh/sdk';

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

  async createCheckout({
    productId,
    user,
  }: {
    user: { name: string; id: string; email: string };
    productId: string;
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
      });

      return { success: true, data: { url: res.url }, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }
}
