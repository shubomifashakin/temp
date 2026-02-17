import { ApiProperty } from '@nestjs/swagger';
import {
  IsDate,
  IsString,
  MaxLength,
  MinLength,
  IsOptional,
  IsStrongPassword,
} from 'class-validator';

export class CreateLinkDto {
  @ApiProperty({
    minLength: 5,
    maxLength: 100,
    description: 'A description for the link',
    example: 'Generated this link to share with friends',
  })
  @MaxLength(100, { message: 'Description is too long' })
  @MinLength(5, { message: 'Description is too short' })
  @IsString({ message: 'Description should be a string' })
  description: string;

  @ApiProperty({
    description:
      'The password for the file. It must contain at least 6 characters, including at least one uppercase letter, one lowercase letter, and one number.',
    required: false,
    minLength: 6,
  })
  @IsString({ message: 'Invalid Password' })
  @IsOptional()
  @IsStrongPassword({
    minLength: 6,
    minSymbols: 0,
    minLowercase: 1,
    minUppercase: 1,
    minNumbers: 1,
  })
  password?: string;

  @IsOptional()
  @IsDate({ message: 'Invalid date' })
  expiresAt?: Date;
}
