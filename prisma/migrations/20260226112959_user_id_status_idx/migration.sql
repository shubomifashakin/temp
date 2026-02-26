-- DropIndex
DROP INDEX "subscriptions_status_idx";

-- DropIndex
DROP INDEX "subscriptions_user_id_idx";

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");
