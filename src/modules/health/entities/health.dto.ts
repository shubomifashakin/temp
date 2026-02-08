import { IsNotEmpty, IsString } from 'class-validator';

export class HealthDto {
  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsNotEmpty()
  timestamp: string;
}
