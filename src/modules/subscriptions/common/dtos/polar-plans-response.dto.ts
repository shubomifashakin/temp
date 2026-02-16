import {
  IsEnum,
  IsArray,
  IsNumber,
  IsString,
  IsOptional,
  IsBoolean,
} from 'class-validator';

import { ApiProperty } from '@nestjs/swagger';

import { BillingInterval, Plan } from '../../../../../generated/prisma/enums';
import { Type } from 'class-transformer';

export class PolarPlan {
  @ApiProperty({ description: 'the id of the plan' })
  @IsString({ message: 'id should be a string' })
  id: string;

  @ApiProperty({
    description: 'The amount the user would be charged in dollars',
  })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Amount should be a number' })
  amountInDollars: number;

  @ApiProperty({ description: 'The amount the user would be charged in cents' })
  @IsNumber({}, { message: 'Amount should be a number' })
  amountInCents: number;

  @ApiProperty({
    example: 'usd',
    description: 'The currency the user would be charged in',
  })
  @IsString({ message: 'currency should be a valid string' })
  currency: string;

  @ApiProperty({
    description: 'The name of the subscription',
    example: Plan.PRO,
  })
  @IsString({ message: 'name should be a string' })
  name: string;

  @ApiProperty({
    description: 'benefits that come with the subscription',
    type: [String],
  })
  @IsArray({ message: 'benefits should be a string array', each: true })
  benefits: string[];

  @ApiProperty({
    enum: BillingInterval,
    description: 'Subscription interval',
  })
  @IsEnum(BillingInterval, { message: 'Invalid billing interval' })
  interval: BillingInterval;
}

export class PolarPlanResponseDto {
  @ApiProperty({ description: 'if there is a next page to fetch or not' })
  @IsBoolean()
  hasNextPage: boolean;

  @ApiProperty({ description: 'pagination cursor', nullable: true, example: 1 })
  @IsOptional()
  @IsNumber({}, { message: 'cursor should be a number' })
  cursor: number | null;

  @ApiProperty({ description: 'the available plans', type: [PolarPlan] })
  @Type(() => PolarPlan)
  @IsArray()
  data: PolarPlan[];
}
