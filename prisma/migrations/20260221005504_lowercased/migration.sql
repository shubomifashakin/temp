/*
  Warnings:

  - The values [DAY,WEEK,MONTH,YEAR] on the enum `BillingInterval` will be removed. If these variants are still used in the database, this will fail.
  - The values [FREE,PRO] on the enum `Plan` will be removed. If these variants are still used in the database, this will fail.
  - The values [POLAR] on the enum `SubscriptionProvider` will be removed. If these variants are still used in the database, this will fail.
  - The values [ACTIVE,INACTIVE] on the enum `SubscriptionStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "BillingInterval_new" AS ENUM ('day', 'week', 'month', 'year');
ALTER TABLE "public"."subscriptions" ALTER COLUMN "interval" DROP DEFAULT;
ALTER TABLE "subscriptions" ALTER COLUMN "interval" TYPE "BillingInterval_new" USING ("interval"::text::"BillingInterval_new");
ALTER TYPE "BillingInterval" RENAME TO "BillingInterval_old";
ALTER TYPE "BillingInterval_new" RENAME TO "BillingInterval";
DROP TYPE "public"."BillingInterval_old";
ALTER TABLE "subscriptions" ALTER COLUMN "interval" SET DEFAULT 'month';
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "Plan_new" AS ENUM ('free', 'pro');
ALTER TABLE "subscriptions" ALTER COLUMN "plan" TYPE "Plan_new" USING ("plan"::text::"Plan_new");
ALTER TYPE "Plan" RENAME TO "Plan_old";
ALTER TYPE "Plan_new" RENAME TO "Plan";
DROP TYPE "public"."Plan_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionProvider_new" AS ENUM ('polar');
ALTER TABLE "subscriptions" ALTER COLUMN "provider" TYPE "SubscriptionProvider_new" USING ("provider"::text::"SubscriptionProvider_new");
ALTER TYPE "SubscriptionProvider" RENAME TO "SubscriptionProvider_old";
ALTER TYPE "SubscriptionProvider_new" RENAME TO "SubscriptionProvider";
DROP TYPE "public"."SubscriptionProvider_old";
COMMIT;

-- AlterEnum
BEGIN;
CREATE TYPE "SubscriptionStatus_new" AS ENUM ('active', 'inactive');
ALTER TABLE "public"."subscriptions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "subscriptions" ALTER COLUMN "status" TYPE "SubscriptionStatus_new" USING ("status"::text::"SubscriptionStatus_new");
ALTER TYPE "SubscriptionStatus" RENAME TO "SubscriptionStatus_old";
ALTER TYPE "SubscriptionStatus_new" RENAME TO "SubscriptionStatus";
DROP TYPE "public"."SubscriptionStatus_old";
ALTER TABLE "subscriptions" ALTER COLUMN "status" SET DEFAULT 'active';
COMMIT;

-- AlterTable
ALTER TABLE "subscriptions" ALTER COLUMN "interval" SET DEFAULT 'month',
ALTER COLUMN "status" SET DEFAULT 'active';
