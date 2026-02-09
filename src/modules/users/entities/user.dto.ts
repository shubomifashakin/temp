import {
  Max,
  Min,
  IsUrl,
  IsDate,
  IsEmail,
  IsString,
  IsOptional,
} from 'class-validator';

export class CachedUserInfo {
  @IsString({ message: 'Invalid name' })
  @Min(3, { message: 'Name is too short' })
  @Max(30, { message: 'Name is too long' })
  name: string;

  @IsEmail({}, { message: 'Invalid email' })
  email: string;

  @IsDate({ message: 'Invalid date' })
  created_at: Date;

  @IsUrl({}, { message: 'Invalid picture url' })
  @IsOptional()
  picture: string | null;

  @IsDate({ message: 'Invalid date' })
  updated_at: Date;
}
