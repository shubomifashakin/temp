import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CliAuthInitResponse {
  @ApiProperty({
    description: 'The authentication code that would be exchanged for a token.',
  })
  @IsString()
  code: string;
}
