import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';

export class SignPartDto {
  @ApiProperty({ description: 'The part number (1–10000)', example: 1 })
  @IsInt()
  @Min(1)
  @Max(10000)
  partNumber: number;
}
