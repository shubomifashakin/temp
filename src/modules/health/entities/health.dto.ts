import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class HealthDto {
  @ApiProperty({ description: 'Status of the server', example: 'ok' })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiProperty({
    description: 'The time this call was made',
    example: new Date().toISOString(),
  })
  @IsString()
  @IsNotEmpty()
  timestamp: string;
}
