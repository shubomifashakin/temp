import { ApiProperty, PickType } from '@nestjs/swagger';

import { CreateLinkDto } from './create-link.dto';
import { IsOptional, IsString } from 'class-validator';

export class GetLinkFileDto extends PickType(CreateLinkDto, ['password']) {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString({ message: 'Password should be a string' })
  password?: string | undefined;
}
