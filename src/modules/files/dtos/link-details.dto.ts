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
  createdAt: Date;

  @ApiProperty({
    type: 'string',
    format: 'date-time',
    description: 'Expires at',
  })
  @IsDate()
  expiresAt: Date | null;

  @ApiProperty({
    type: 'string',
    description: 'Description of the link',
  })
  @IsString({ message: 'Description must be a string' })
  description: string;

  @ApiProperty({
    type: 'number',
    description: 'Click count',
  })
  @IsNumber()
  clickCount: number;

  @ApiProperty({
    type: 'string',
    format: 'date-time',
    description: 'Last accessed at',
  })
  @IsDate()
  lastAccessedAt: Date | null;

  @ApiProperty({
    type: 'boolean',
    description: 'Password protected',
  })
  @IsBoolean()
  passwordProtected: boolean;

  @ApiProperty({
    type: 'string',
    description: 'File creator',
  })
  @IsString({ message: 'File creator must be a string' })
  fileCreator: string;

  @ApiProperty({
    type: 'string',
    description: 'File status',
    example: FileStatus.safe,
  })
  @IsEnum(FileStatus, { message: 'File status must be a valid enum value' })
  fileStatus: FileStatus;

  @ApiProperty({
    type: 'string',
    description: 'File description',
  })
  @IsString({ message: 'File description must be a string' })
  fileDescription: string;

  @ApiProperty({
    type: 'string',
    description: 'File name',
  })
  @IsString({ message: 'fileName must be a string' })
  fileName: string;

  @ApiProperty({
    type: 'boolean',
    description: 'File deleted',
  })
  @IsBoolean()
  fileDeleted: boolean;
}
