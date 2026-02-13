import { BillingInterval, Plan } from '../../../../generated/prisma/enums';

export const availablePolarPlans: Record<
  string,
  { plan: Plan; interval: BillingInterval }
> = {
  [process.env.POLAR_PRODUCT_PRO!]: {
    plan: Plan.PRO,
    interval: BillingInterval.MONTH,
  },
};
