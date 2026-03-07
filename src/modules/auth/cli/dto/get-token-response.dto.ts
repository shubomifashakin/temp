import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class CliGetTokenResponseDto {
  @ApiProperty({
    description: 'The token that would be used for authentication',
    nullable: true,
  })
  @IsString()
  token: string | null;
}
