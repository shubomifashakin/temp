import { ApiProperty } from '@nestjs/swagger';

import { IsUrl } from 'class-validator';

export class CreateCheckoutResponse {
  @ApiProperty({
    description: 'URL to redirect the user to complete the checkout process',
    example: 'https://checkout.example.com/12345',
  })
  @IsUrl()
  url: string;
}
