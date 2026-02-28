-- CreateEnum
CREATE TYPE "Provider" AS ENUM ('google');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('safe', 'unsafe', 'pending');

-- CreateEnum
CREATE TYPE "SubscriptionProvider" AS ENUM ('polar');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('free', 'pro');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('day', 'week', 'month', 'year');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "picture" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "Provider" NOT NULL,
    "provider_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "description" VARCHAR(100) NOT NULL,
    "s3_key" TEXT NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "content_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "size" INTEGER NOT NULL,
    "status" "FileStatus" NOT NULL DEFAULT 'pending',
    "last_event_at" TIMESTAMP(3),
    "user_id" TEXT NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "links" (
    "id" TEXT NOT NULL,
    "share_id" TEXT NOT NULL,
    "click_count" INTEGER NOT NULL DEFAULT 0,
    "description" VARCHAR(100) NOT NULL,
    "file_id" TEXT NOT NULL,
    "last_accessed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "password" TEXT,

    CONSTRAINT "links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "SubscriptionProvider" NOT NULL,
    "provider_subscription_id" TEXT NOT NULL,
    "provider_customer_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "interval" "BillingInterval" NOT NULL DEFAULT 'month',
    "interval_count" INTEGER NOT NULL DEFAULT 1,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'active',
    "started_at" TIMESTAMP(3) NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "trial_ends_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "last_event_at" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_id_key" ON "refresh_tokens"("token_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_s3_key_key" ON "files"("s3_key");

-- CreateIndex
CREATE INDEX "files_user_id_idx" ON "files"("user_id");

-- CreateIndex
CREATE INDEX "files_s3_key_idx" ON "files"("s3_key");

-- CreateIndex
CREATE UNIQUE INDEX "files_name_user_id_content_type_key" ON "files"("name", "user_id", "content_type");

-- CreateIndex
CREATE UNIQUE INDEX "links_share_id_key" ON "links"("share_id");

-- CreateIndex
CREATE INDEX "file_id_idx" ON "links"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_key" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_provider_subscription_id_idx" ON "subscriptions"("provider_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_provider_provider_customer_id_idx" ON "subscriptions"("provider", "provider_customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_subscription_id_user_id_key" ON "subscriptions"("provider_subscription_id", "user_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "links" ADD CONSTRAINT "links_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
