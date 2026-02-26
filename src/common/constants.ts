import { Algorithm } from 'jsonwebtoken';
import { BillingInterval, Plan } from '../../generated/prisma/enums';

import { SubscriptionRecurringInterval } from '@polar-sh/sdk/models/components/subscriptionrecurringinterval.js';

export const DAYS_1 = 60 * 60 * 24;
export const DAYS_1_MS = DAYS_1 * 1000;
export const DAYS_7 = 60 * 60 * 24 * 7;
export const DAYS_7_MS = DAYS_7 * 1000;
export const DAYS_14 = 14 * 24 * 60 * 60;
export const DAYS_14_MS = DAYS_14 * 1000;
export const MINUTES_30 = 30 * 60;
export const MINUTES_30_MS = MINUTES_30 * 1000;
export const MINUTES_10 = 10 * 60;
export const MINUTES_10_MS = MINUTES_10 * 1000;
export const MINUTES_5 = 5 * 60;
export const MINUTES_5_MS = MINUTES_5 * 1000;
export const MINUTES_1 = 1 * 60;
export const MINUTES_1_MS = MINUTES_1 * 1000;
export const SECONDS_10 = 10;
export const SECONDS_10_MS = SECONDS_10 * 1000;
export const SECONDS_20 = 20;
export const SECONDS_20_MS = SECONDS_20 * 1000;

export const TOKEN = {
  ACCESS: {
    TYPE: 'access_token' as const,
    EXPIRATION: '10m',
    EXPIRATION_SEC: MINUTES_10,
    EXPIRATION_MS: MINUTES_10_MS,
  },
  REFRESH: {
    TYPE: 'refresh_token' as const,
    EXPIRATION: '14d',
    EXPIRATION_SEC: DAYS_14,
    EXPIRATION_MS: DAYS_14_MS,
  },
} as const;

export const MESSAGES = {
  UNAUTHORIZED: 'Unauthorized',
  INTERNAL_SERVER_ERROR: 'Internal Server Error',
  NOT_FOUND: 'does not Exist',
};

export const DEFAULT_JWT_ALG: Algorithm = 'RS256';

export const mappedPolarIntervals: Record<
  SubscriptionRecurringInterval,
  BillingInterval
> = {
  [SubscriptionRecurringInterval.Day]: BillingInterval.day,
  [SubscriptionRecurringInterval.Year]: BillingInterval.year,
  [SubscriptionRecurringInterval.Week]: BillingInterval.week,
  [SubscriptionRecurringInterval.Month]: BillingInterval.month,
};

export const benefits = {
  [Plan.free]: [
    'Max file size of 25mb',
    '7 day retention',
    '1 link per file',
    'Virus Scanning',
    'Click Tracking',
  ],
  [Plan.pro]: [
    'Everything in free',
    '14 & 31 day retention',
    'Unlimited links',
    'Max file size of 150mb',
    'All new features',
  ],
};
