import { ApiProperty } from '@nestjs/swagger';

import { IsEnum, IsString } from 'class-validator';
import { SubscriptionProvider } from '../../../../../generated/prisma/enums';

export class CreateCheckoutDto {
  @ApiProperty({
    description: 'The product ID to create a checkout for',
  })
  @IsString({ message: 'Product ID must be a string' })
  productId: string;

  @ApiProperty({
    description: 'The provider to checkout with',
    enum: SubscriptionProvider,
    default: SubscriptionProvider.POLAR,
  })
  @IsEnum(SubscriptionProvider, { message: 'unknown subscription provider' })
  provider: SubscriptionProvider;
}
