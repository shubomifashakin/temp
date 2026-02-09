import { ApiProperty } from '@nestjs/swagger';
import {
  IsUrl,
  IsDate,
  IsEmail,
  IsString,
  IsOptional,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CachedUserInfo {
  @ApiProperty({
    description: 'The name of the user',
    example: 'John Doe',
    minLength: 3,
    maxLength: 50,
  })
  @IsString({ message: 'Invalid name' })
  @MinLength(3, { message: 'Name is too short' })
  @MaxLength(50, { message: 'Name is too long' })
  name: string;

  @ApiProperty({
    example: 'example@gmail.com',
    description: 'The email of the user',
  })
  @IsEmail({}, { message: 'Invalid email' })
  email: string;

  @ApiProperty({ description: 'The date the users account was created' })
  @IsDate({ message: 'Invalid date' })
  created_at: Date;

  @ApiProperty({
    description: 'The picture of the user gotten from google, if any',
  })
  @IsUrl({}, { message: 'Invalid picture url' })
  @IsOptional()
  picture: string | null;

  @ApiProperty({ description: 'The date the users account was last updated' })
  @IsDate({ message: 'Invalid date' })
  updated_at: Date;
}
