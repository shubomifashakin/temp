import { ApiProperty } from '@nestjs/swagger';

import {
  IsString,
  IsNumber,
  IsDate,
  IsOptional,
  IsBoolean,
} from 'class-validator';

class Link {
  @ApiProperty({
    description: 'Id of the  link',
    example: '12345678-1234-1234-1234-123456789012',
  })
  @IsString({ message: 'id must be a string' })
  id: string;

  @ApiProperty({
    description: 'Whether the link is password protected',
    example: false,
  })
  @IsBoolean({ message: 'passwordProtected must be a boolean' })
  passwordProtected: boolean;

  @ApiProperty({
    description: 'When the link was revoked',
    example: new Date(),
    nullable: true,
  })
  @IsDate({ message: 'revokedAt must be a date' })
  @IsOptional()
  revokedAt: Date | null;

  @ApiProperty({
    description: 'Date and time when the link was created',
    example: '2025-01-01T00:00:00.000Z',
  })
  @IsDate({ message: 'createdAt must be a date' })
  createdAt: Date;

  @ApiProperty({
    description: 'Number of times the link has been accessed',
    example: 5,
  })
  @IsNumber({}, { message: 'clickCount must be a number' })
  clickCount: number;

  @ApiProperty({
    nullable: true,
    example: '2025-01-01T00:00:00.000Z',
    description: 'Date when the link expires',
  })
  @IsDate({ message: 'expiresAt must be a date' })
  @IsOptional()
  expiresAt: Date | null;

  @ApiProperty({
    description: 'Description of the  link',
    example: 'Link for project files',
  })
  @IsString({ message: 'description must be a string' })
  description: string;

  @ApiProperty({
    nullable: true,
    example: '2025-01-01T00:00:00.000Z',
    description: 'Date and time when the  link was last accessed',
  })
  @IsDate({ message: 'lastAccessedAt must be a date' })
  @IsOptional()
  lastAccessedAt: Date | null;
}

export class GetFileLinksResponseDto {
  @ApiProperty({
    type: [Link],
    description: 'List of links for the file',
  })
  data: Link[];

  @ApiProperty({
    example: false,
    description: 'Whether there are more links to be fetched',
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
