import { ApiProperty } from '@nestjs/swagger';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsString,
  IsOptional,
} from 'class-validator';

import { FileStatus } from '../../../../generated/prisma/enums';

import { UploadFileDto } from './upload-file.dto';

export class GetFileDto extends UploadFileDto {
  @ApiProperty({ description: 'The id of the file' })
  @IsString()
  id: string;

  @ApiProperty({
    example: 10,
    description: 'The amount of times the file has been viewed',
  })
  @IsNumber()
  view_count: number;

  @ApiProperty({
    example: new Date().toISOString(),
    description: 'The date the file was uploaded',
  })
  @IsDate()
  created_at: Date;

  @ApiProperty({
    example: new Date().toISOString(),
    description: 'The date the file was updated last',
  })
  @IsDate()
  updated_at: Date;

  @ApiProperty({
    required: false,
    example: new Date().toISOString(),
    description: 'The date the file was deleted',
  })
  @IsOptional()
  @IsDate()
  deleted_at: Date | null;

  @ApiProperty({
    required: false,
    example: new Date().toISOString(),
    description: 'The date the file was last accessed',
  })
  @IsOptional()
  @IsDate()
  last_accesed_at: Date | null;

  @ApiProperty({ description: 'The status of the file' })
  @IsEnum(FileStatus, { message: 'Invalid file status' })
  status: FileStatus;

  @ApiProperty({ description: 'The id of the user that owns the file' })
  @IsString({ message: 'Invalid userId' })
  user_id: string;
}
