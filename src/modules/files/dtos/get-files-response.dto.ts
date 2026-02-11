import { ApiProperty } from '@nestjs/swagger';

import {
  IsString,
  IsNumber,
  IsDate,
  IsOptional,
  IsEnum,
} from 'class-validator';

import { FileStatus } from '../../../../generated/prisma/enums';

class File {
  @ApiProperty({
    description: 'Id of the file',
    example: '12345678-1234-1234-1234-123456789012',
  })
  @IsString({ message: 'id must be a string' })
  id: string;

  @ApiProperty({
    description: 'description of the file',
    example: 'My file description',
  })
  @IsString({ message: 'description must be a string' })
  description: string;

  @ApiProperty({
    description: 'Number of times the file has been viewed',
    example: 1,
  })
  @IsNumber({}, { message: 'View count must be a number' })
  view_count: number;

  @ApiProperty({
    description: 'Date and time when the file expires',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate({ message: 'expiresAt must be a date' })
  expires_at: Date;

  @ApiProperty({
    description: 'Size of the file in bytes',
    example: 1024,
  })
  @IsNumber({}, { message: 'size must be a number' })
  size: number;

  @ApiProperty({
    nullable: true,
    example: '2025-01-01T00:00:00.000Z',
    description: 'the last time the file was accessed',
  })
  @IsDate({ message: 'last_accesed_at must be a date' })
  @IsOptional()
  last_accesed_at: Date | null;

  @ApiProperty({
    example: FileStatus.safe,
    description: 'the status of the file',
  })
  @IsEnum(FileStatus, { message: 'status must be a valid file status' })
  status: FileStatus;
}

export class GetFilesResponseDto {
  @ApiProperty({
    type: [File],
    description: 'List of files',
  })
  data: File[];

  @ApiProperty({
    example: false,
    description: 'Whether there are more files to be fetched',
  })
  hasNextPage: boolean;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Cursor for pagination',
  })
  cursor: string | null;
}
