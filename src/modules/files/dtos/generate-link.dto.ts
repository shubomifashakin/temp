import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  IsStrongPassword,
  IsDate,
} from 'class-validator';

export class GenerateLinkDto {
  @ApiProperty({
    minLength: 5,
    maxLength: 100,
    description: 'A description for the link',
    example: 'Generated this link to share with friends',
  })
  @IsString({ message: 'Invalid description' })
  @MinLength(5, { message: 'Description is too short' })
  @MaxLength(100, { message: 'Description is too long' })
  description: string;

  @ApiProperty({ description: 'The password for the file', required: false })
  @IsString({ message: 'Invalid Password' })
  @IsOptional()
  @IsStrongPassword({ minLength: 6 })
  password?: string;

  @IsOptional()
  @IsDate({ message: 'Invalid date' })
  expiresAt?: Date;
}
