import { ApiProperty, OmitType } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
} from 'class-validator';

import { FileStatus } from '../../../../generated/prisma/enums';

import { UploadFileDto } from './upload-file.dto';

export class GetFileDto extends OmitType(UploadFileDto, ['lifetime']) {
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
