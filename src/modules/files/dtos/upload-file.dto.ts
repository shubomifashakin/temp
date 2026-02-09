import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { Files } from '../../../../generated/prisma/client';

export class UploadFileDto implements Pick<Files, 'description'> {
  @ApiProperty({
    minLength: 5,
    maxLength: 100,
    example: 'My yearbook photo',
    description: 'The description of the file that was uploaded',
  })
  @IsString()
  @MinLength(5, { message: 'File description is too short' })
  @MaxLength(100, { message: 'File description is too long' })
  description: string;
}
