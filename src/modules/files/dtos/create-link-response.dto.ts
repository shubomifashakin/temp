import { ApiProperty } from '@nestjs/swagger';

import { IsString } from 'class-validator';

export class CreateLinkResponseDto {
  @ApiProperty({
    description: 'Id of the link',
    example: '1234567890',
  })
  @IsString({
    message: 'Id must be a string. This is the database id of the link',
  })
  id: string;

  @ApiProperty({
    description: 'Share ID of the link. This is the id that is used in the url',
    example: 'share123',
  })
  @IsString({ message: 'Share ID must be a string' })
  shareId: string;
}
