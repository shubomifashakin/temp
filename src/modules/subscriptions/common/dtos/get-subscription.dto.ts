import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsEnum,
  IsDate,
} from 'class-validator';

import {
  Plan,
  SubscriptionProvider,
  SubscriptionStatus,
} from '../../../../../generated/prisma/enums';

class SubscriptionDetails {
  @ApiProperty({
    description: 'The unique identifier for the subscription',
    example: 'sub1234',
  })
  @IsString({ message: 'Subscription ID should be a string' })
  id: string;

  @ApiProperty({
    description:
      'The product ID for the subscription. The product the user is currently subscribed to.',
    example: 'prod1234',
  })
  @IsString({ message: 'Product ID should be a string' })
  productId: string;

  @ApiProperty({
    description: 'The current status of the subscription',
    enum: SubscriptionStatus,
    example: SubscriptionStatus.active,
  })
  @IsEnum(SubscriptionStatus, { message: 'Invalid subscription status' })
  status: SubscriptionStatus;

  @ApiProperty({
    description:
      'The amount charged for the subscription in the smallest currency unit',
    example: 2000,
  })
  @IsNumber({}, { message: 'Amount should be a number' })
  amount: number;

  @ApiProperty({
    description: 'The currency code for the subscription',
    example: 'usd',
  })
  @IsString({ message: 'Currency should be a string' })
  currency: string;

  @ApiProperty({
    description: 'The plan for the subscription',
    enum: Plan,
    example: Plan.free,
  })
  @IsEnum(Plan, { message: 'Invalid plan' })
  plan: Plan;

  @ApiProperty({
    description: 'The payment provider handling the subscription',
    enum: SubscriptionProvider,
    example: SubscriptionProvider.polar,
  })
  @IsEnum(SubscriptionProvider, { message: 'Invalid subscription provider' })
  provider: SubscriptionProvider;

  @ApiProperty({
    description: 'Timestamp when the subscription was cancelled',
    nullable: true,
  })
  @IsOptional()
  @IsDate({ message: 'Cancelled at should be a date' })
  cancelledAt: Date | null;

  @ApiProperty({
    description: 'Timestamp when the current billing period ends',
  })
  @IsOptional()
  @IsDate({ message: 'Current period end should be a date' })
  currentPeriodEnd: Date;

  @ApiProperty({
    description: 'Timestamp when the current billing period started',
    required: false,
  })
  @IsDate({ message: 'Current period start should be a date' })
  currentPeriodStart: Date;

  @ApiProperty({
    description:
      'Whether the subscription will cancel at the end of the current billing period',
    example: false,
  })
  @IsBoolean({ message: 'Cancel at period end should be a boolean' })
  cancelAtPeriodEnd: boolean;

  @ApiProperty({
    description: 'The subscription ID from the payment provider',
    example: 'polarsub123',
  })
  @IsString({ message: 'Provider subscription ID should be a string' })
  providerSubscriptionId: string;
}

export class GetSubscriptionResponse {
  @ApiProperty({
    description: 'The subscription details',
    type: SubscriptionDetails,
    nullable: true,
  })
  data: SubscriptionDetails | null;
}
