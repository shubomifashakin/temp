/*
  Warnings:

  - A unique constraint covering the columns `[provider_subscription_id,user_id]` on the table `subscriptions` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "subscriptions_user_id_key";

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_user_id_key" ON "subscriptions"("provider_subscription_id", "user_id");
