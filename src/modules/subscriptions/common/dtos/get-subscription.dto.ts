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
  SubscriptionProvider,
  SubscriptionStatus,
} from '../../../../../generated/prisma/enums';

class SubscriptionDetails {
  @ApiProperty({
    description: 'The unique identifier for the subscription',
    example: 'sub_123456789',
  })
  @IsString({ message: 'Subscription ID should be a string' })
  id: string;

  @ApiProperty({
    description: 'The current status of the subscription',
    enum: SubscriptionStatus,
    example: SubscriptionStatus.ACTIVE,
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
    description: 'The payment provider handling the subscription',
    enum: SubscriptionProvider,
    example: SubscriptionProvider.POLAR,
  })
  @IsEnum(SubscriptionProvider, { message: 'Invalid subscription provider' })
  provider: SubscriptionProvider;

  @ApiProperty({
    description: 'Timestamp when the subscription was cancelled',
    required: false,
  })
  @IsOptional()
  @IsDate({ message: 'Cancelled at should be a date' })
  cancelled_at: Date | null;

  @ApiProperty({
    description: 'Timestamp when the current billing period ends',
    required: false,
  })
  @IsOptional()
  @IsDate({ message: 'Current period end should be a date' })
  current_period_end: Date | null;

  @ApiProperty({
    description: 'Timestamp when the current billing period started',
    required: false,
  })
  @IsDate({ message: 'Current period start should be a date' })
  current_period_start: Date;

  @ApiProperty({
    description:
      'Whether the subscription will cancel at the end of the current billing period',
    example: false,
  })
  @IsBoolean({ message: 'Cancel at period end should be a boolean' })
  cancel_at_period_end: boolean;

  @ApiProperty({
    description: 'The subscription ID from the payment provider',
    example: 'polar_sub_123456789',
  })
  @IsString({ message: 'Provider subscription ID should be a string' })
  provider_subscription_id: string;
}

export class GetSubscriptionResponse {
  @ApiProperty({
    description: 'The subscription details',
    type: SubscriptionDetails,
    nullable: true,
  })
  data: SubscriptionDetails | null;
}
