import { BillingInterval, Plan } from '../../../../generated/prisma/enums';

import { SubscriptionRecurringInterval } from '@polar-sh/sdk/models/components/subscriptionrecurringinterval.js';

export const availablePolarPlans: Record<
  string,
  { plan: Plan; interval: BillingInterval }
> = {
  [process.env.POLAR_PRODUCT_PRO!]: {
    plan: Plan.PRO,
    interval: BillingInterval.MONTH,
  },
};

export const mappedPolarIntervals = {
  [SubscriptionRecurringInterval.Day]: BillingInterval.DAY,
  [SubscriptionRecurringInterval.Year]: BillingInterval.YEAR,
  [SubscriptionRecurringInterval.Week]: BillingInterval.WEEK,
  [SubscriptionRecurringInterval.Month]: BillingInterval.MONTH,
};

export const benefits = {
  [Plan.FREE]: ['7Day lifetime', 'Up to 25mb file'],
  [Plan.PRO]: ['Longer lifetimes (14days, 1Month)', 'Up to 100Mb files'],
};

export function polarProductIdToPlan(
  productId: string,
  interval: SubscriptionRecurringInterval,
) {
  const polarProId = process.env.POLAR_PRODUCT_PRO;

  if (!polarProId) {
    throw new Error('Polar Pro ProductId Not Set In Env');
  }

  const plans = {
    [polarProId]: {
      plan: Plan.PRO,
      features: benefits[Plan.PRO],
      interval: mappedPolarIntervals[interval],
    },
  };

  return (
    plans[productId] || {
      plan: Plan.FREE,
      features: benefits[Plan.FREE],
      interval: BillingInterval.MONTH,
    }
  );
}
