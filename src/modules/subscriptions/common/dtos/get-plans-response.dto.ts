import { IsEnum, IsArray, IsNumber, IsString } from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

import {
  BillingInterval,
  Plan as DbPlan,
  SubscriptionProvider,
} from '../../../../../generated/prisma/enums';
import { Type } from 'class-transformer';

class Plan {
  @ApiProperty({ description: 'The amount the user would be charged' })
  @IsNumber({}, { message: 'Amount should be a number' })
  amount: number;

  @ApiProperty({
    example: 'usd',
    description: 'The currency the user would be charged in',
  })
  @IsString({ message: 'currency should be a valid string' })
  currency: string;

  @ApiProperty({
    description: 'The name of the subscription',
    example: DbPlan.PRO,
  })
  @IsString({ message: 'name should be a string' })
  name: string;

  @ApiProperty({
    description: 'The product ID for the subscription',
  })
  @IsString({ message: 'product_id should be a string' })
  product_id: string;

  @ApiProperty({
    description: 'benefits that come with the subscription',
    type: [String],
  })
  @IsArray({ message: 'benefits should be a string array', each: true })
  benefits: string[];

  @ApiProperty({
    enum: BillingInterval,
    description: 'Subscription interval',
    example: BillingInterval.MONTH,
  })
  @IsEnum(BillingInterval, { message: 'Invalid billing interval' })
  interval: BillingInterval;
}

export class PlanInfo {
  @ApiProperty({ description: 'the currency of the plan' })
  @IsString({ message: 'currency should be a string' })
  currency: string;

  @ApiProperty({
    description: 'The payment provider for the plan',
    example: SubscriptionProvider.POLAR,
  })
  @IsString({
    message: 'provider should be a string',
  })
  provider: string;

  @ApiProperty({ description: 'The available plans', type: [Plan] })
  @Type(() => Plan)
  @IsArray()
  plans: Plan[];
}

class PlansByCycle {
  @ApiProperty({
    description: 'The available plans for monthly billing',
    type: [PlanInfo],
  })
  @Type(() => PlanInfo)
  @IsArray()
  month: PlanInfo[];

  @ApiProperty({
    description: 'The available plans for yearly billing',
    type: [PlanInfo],
  })
  @Type(() => PlanInfo)
  @IsArray()
  year: PlanInfo[];
}

export class GetPlansResponse {
  @ApiProperty({
    description: 'The available plans across all payment providers',
    type: PlansByCycle,
  })
  @Type(() => PlansByCycle)
  data: PlansByCycle;
}
