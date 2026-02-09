import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

import { Files } from '../../../../generated/prisma/client';

import { LIFETIMES, type Lifetime } from '../common/constants';

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

  @ApiProperty({
    enum: LIFETIMES,
    example: LIFETIMES.LONG,
    description: 'How long the file should be stored',
  })
  @IsEnum(LIFETIMES, { message: 'Invalid lifetime' })
  lifetime: Lifetime;
}
