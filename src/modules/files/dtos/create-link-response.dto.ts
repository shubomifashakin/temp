import { ApiProperty } from '@nestjs/swagger';

import { IsString } from 'class-validator';

export class CreateLinkResponseDto {
  @ApiProperty({
    description: 'Id of the link',
    example: '1234567890',
  })
  @IsString({ message: 'Id must be a string' })
  id: string;
}
