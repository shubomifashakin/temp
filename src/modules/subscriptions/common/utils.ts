import { SubscriptionRecurringInterval } from '@polar-sh/sdk/models/components/subscriptionrecurringinterval.js';

import { benefits, mappedPolarIntervals } from './constants';

import { FnResult } from '../../../types/common.types';

import { BillingInterval, Plan } from '../../../../generated/prisma/enums';

export function polarProductIdToPlan(
  productId: string,
  interval: SubscriptionRecurringInterval,
): FnResult<{ plan: Plan; benefits: string[]; interval: BillingInterval }> {
  const polarProId = process.env.POLAR_PRODUCT_PRO;

  if (!polarProId) {
    throw new Error('Polar Pro ProductId Not Set In Env');
  }

  const plans = {
    [polarProId]: {
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

export function formatCentsToPrice(amountInCents: number, currency: string) {
  const amountInDollars = centsToDollars(amountInCents);

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountInDollars);
}

export function centsToDollars(amountInCents: number) {
  return amountInCents / 100;
}
