import { ApiProperty } from '@nestjs/swagger';
import {
  IsUrl,
  IsDate,
  IsEmail,
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
  IsEnum,
  IsBoolean,
} from 'class-validator';

import { UserCreateInput } from '../../../../generated/prisma/models';
import { Plan } from '../../../../generated/prisma/enums';

class UserSubscription {
  @ApiProperty({ description: 'The users current plan', enum: Plan })
  @IsEnum(Plan, { message: 'Invalid plan' })
  plan: Plan;

  @ApiProperty({
    type: Date,
    nullable: true,
    description: 'When the subscription ends',
  })
  @IsDate()
  current_period_end: Date | null;

  @ApiProperty({ description: 'When the subscription started', type: Date })
  @IsDate()
  current_period_start: Date;

  @ApiProperty({
    description: 'If the subscription is going to be renewed or not',
  })
  @IsBoolean()
  cancel_at_period_end: boolean;
}

export class CachedUserInfo implements Pick<
  UserCreateInput,
  'name' | 'email' | 'picture' | 'created_at' | 'updated_at'
> {
  @ApiProperty({
    description: 'The name of the user',
    example: 'John Doe',
    minLength: 3,
    maxLength: 50,
  })
  @IsString({ message: 'Invalid name' })
  @MinLength(3, { message: 'Name is too short' })
  @MaxLength(50, { message: 'Name is too long' })
  name: string;

  @ApiProperty({
    example: 'example@gmail.com',
    description: 'The email of the user',
  })
  @IsEmail({}, { message: 'Invalid email' })
  email: string;

  @ApiProperty({
    description: 'The date the users account was created',
    example: new Date().toISOString(),
  })
  @IsDate({ message: 'Invalid date' })
  created_at: Date;

  @ApiProperty({
    description: 'The picture of the user gotten from google, if any',
    nullable: true,
    required: false,
    example: 'https://example.com/avatar.png',
  })
  @IsUrl({}, { message: 'Invalid picture url' })
  @IsOptional()
  picture: string | null;

  @ApiProperty({
    description: 'The date the users account was last updated',
    example: new Date().toISOString(),
  })
  @IsDate({ message: 'Invalid date' })
  updated_at: Date;

  @ApiProperty({
    nullable: true,
    type: UserSubscription,
    description: 'The users subscription info',
  })
  subscription: UserSubscription | null;
}
