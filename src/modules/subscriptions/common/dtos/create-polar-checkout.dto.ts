import { ApiProperty } from '@nestjs/swagger';

import { IsString } from 'class-validator';

export class CreatePolarCheckoutDto {
  @ApiProperty({
    description: 'The product ID to create a checkout for',
  })
  @IsString({ message: 'Product ID must be a string' })
  product_id: string;
}
