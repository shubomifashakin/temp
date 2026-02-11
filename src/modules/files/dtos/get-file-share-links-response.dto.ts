import { ApiProperty } from '@nestjs/swagger';

import {
  IsString,
  IsNumber,
  IsDate,
  IsOptional,
  IsBoolean,
} from 'class-validator';

class ShareLink {
  @ApiProperty({
    description: 'Id of the share link',
    example: '12345678-1234-1234-1234-123456789012',
  })
  @IsString({ message: 'id must be a string' })
  id: string;

  @ApiProperty({
    description: 'Whether the share link is password protected',
    example: false,
  })
  @IsBoolean({ message: 'password_protected must be a boolean' })
  password_protected: boolean;

  @ApiProperty({
    description: 'Whether the share link has been revoked',
    example: false,
    nullable: true,
  })
  @IsDate({ message: 'revoked_at must be a date' })
  @IsOptional()
  revoked_at: Date | null;

  @ApiProperty({
    description: 'Date and time when the share link was created',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate({ message: 'created_at must be a date' })
  created_at: Date;

  @ApiProperty({
    description: 'Number of times the share link has been accessed',
    example: 5,
  })
  @IsNumber({}, { message: 'click_count must be a number' })
  click_count: number;

  @ApiProperty({
    nullable: true,
    example: '2025-01-01T00:00:00.000Z',
    description: 'Date and time when the share link expires',
  })
  @IsDate({ message: 'expires_at must be a date' })
  @IsOptional()
  expires_at: Date | null;

  @ApiProperty({
    description: 'Description of the share link',
    example: 'Share link for project files',
  })
  @IsString({ message: 'description must be a string' })
  description: string;

  @ApiProperty({
    nullable: true,
    example: '2025-01-01T00:00:00.000Z',
    description: 'Date and time when the share link was last accessed',
  })
  @IsDate({ message: 'last_accessed_at must be a date' })
  @IsOptional()
  last_accessed_at: Date | null;
}

export class GetFileShareLinksResponseDto {
  @ApiProperty({
    type: [ShareLink],
    description: 'List of share links for the file',
  })
  data: ShareLink[];

  @ApiProperty({
    example: false,
    description: 'Whether there are more share links to be fetched',
  })
  @IsBoolean({ message: 'hasNextPage must be a boolean' })
  hasNextPage: boolean;

  @ApiProperty({
    example: null,
    nullable: true,
    description: 'Cursor for pagination to fetch next page',
  })
  @IsString({ message: 'cursor must be a string' })
  @IsOptional()
  cursor: string | null;
}
