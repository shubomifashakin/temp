import { ApiProperty } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

import { FileStatus } from '../../../../generated/prisma/enums';

export class GetFileDto {
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

  @ApiProperty({ description: 'The id of the file' })
  @IsString()
  id: string;

  @ApiProperty({
    example: 100000,
    description: 'The size of the file in bytes',
  })
  @IsNumber()
  size: number;

  @ApiProperty({
    example: new Date().toISOString(),
    description: 'The date the file was uploaded',
  })
  @IsDate()
  createdAt: Date;

  @ApiProperty({
    example: new Date().toISOString(),
    description: 'The date the file expires',
  })
  @IsDate()
  expiresAt: Date;

  @ApiProperty({
    example: new Date().toISOString(),
    description: 'The date the file was updated last',
  })
  @IsDate()
  updatedAt: Date;

  @ApiProperty({ description: 'the content type of the file' })
  @IsString()
  contentType: string;

  @ApiProperty({
    required: false,
    example: new Date().toISOString(),
    description: 'The date the file was deleted',
  })
  @IsOptional()
  @IsDate()
  deletedAt: Date | null;

  @ApiProperty({ description: 'The status of the file' })
  @IsEnum(FileStatus, { message: 'Invalid file status' })
  status: FileStatus;

  @ApiProperty({ description: 'The id of the user that owns the file' })
  @IsString({ message: 'Invalid userId' })
  userId: string;
}
