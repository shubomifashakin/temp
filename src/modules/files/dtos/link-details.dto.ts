import { ApiProperty } from '@nestjs/swagger';
import { IsDate, IsString, IsNumber, IsBoolean, IsEnum } from 'class-validator';

import { FileStatus } from '../../../../generated/prisma/enums';

export class LinkDetailsDto {
  @ApiProperty({
    type: 'string',
    format: 'date-time',
    description: 'Created at',
  })
  @IsDate()
  created_at: Date;

  @ApiProperty({
    type: 'string',
    format: 'date-time',
    description: 'Expires at',
  })
  @IsDate()
  expires_at: Date | null;

  @ApiProperty({
    type: 'string',
    description: 'Description',
  })
  @IsString({ message: 'Description must be a string' })
  description: string;

  @ApiProperty({
    type: 'number',
    description: 'Click count',
  })
  @IsNumber()
  click_count: number;

  @ApiProperty({
    type: 'string',
    format: 'date-time',
    description: 'Last accessed at',
  })
  @IsDate()
  last_accessed_at: Date | null;

  @ApiProperty({
    type: 'boolean',
    description: 'Password protected',
  })
  @IsBoolean()
  password_protected: boolean;

  @ApiProperty({
    type: 'string',
    description: 'File creator',
  })
  @IsString({ message: 'File creator must be a string' })
  file_creator: string;

  @ApiProperty({
    type: 'string',
    description: 'File status',
    example: FileStatus.safe,
  })
  @IsEnum(FileStatus, { message: 'File status must be a valid enum value' })
  file_status: FileStatus;

  @ApiProperty({
    type: 'string',
    description: 'File description',
  })
  @IsString({ message: 'File description must be a string' })
  file_description: string;

  @ApiProperty({
    type: 'boolean',
    description: 'File deleted',
  })
  @IsBoolean()
  file_deleted: boolean;
}
