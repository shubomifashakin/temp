import { ApiProperty } from '@nestjs/swagger';

import { IsString } from 'class-validator';

export class CreateCheckoutDto {
  @ApiProperty({
    description: 'The product ID to create a checkout for',
  })
  @IsString({ message: 'Product ID must be a string' })
  product_id: string;

  @ApiProperty({
    description: 'The provider to checkout with',
    enum: ['polar'],
    default: 'polar',
  })
  @IsString({ message: 'Provider must be a string' })
  provider: 'polar';
}
