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
      error: new Error(`Plan for productId:${productId} does not exist`),
      data: null,
    };
  }

  return { success: true, data: selectedPlan, error: null };
}
