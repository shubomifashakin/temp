import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CliAuthInitResponse {
  @ApiProperty({ description: 'The oauth code' })
  @IsString()
  code: string;
}
