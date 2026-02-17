import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

import { File } from '../../../../generated/prisma/client';

import { LIFETIMES, type Lifetime } from '../common/constants';

export class UploadFileDto implements Pick<File, 'description'> {
  @ApiProperty({
    minLength: 5,
    maxLength: 100,
    example: 'My highschool yearbook photo',
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

  @ApiProperty({
    description: 'The name of the file',
    maxLength: 50,
    minLength: 5,
    example: 'Yearbook',
    pattern: '^[a-zA-Z0-9\\s\\-_]+$',
  })
  @IsString()
  @MinLength(5, { message: 'File name is too short' })
  @MaxLength(50, { message: 'File name is too long' })
  @Matches(/^[a-zA-Z0-9\s\-_]+$/, {
    message:
      'File name can only contain letters, numbers, spaces, hyphens, and underscores',
  })
  name: string;
}
