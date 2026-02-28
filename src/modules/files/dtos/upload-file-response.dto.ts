import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsObject } from 'class-validator';

export class UploadFileResponseDto {
  @ApiProperty({
    description:
      'The url to upload the file to. This url is valid for only 30 minutes.',
    example: 'https://s3.amazonaws.com/bucket/key',
  })
  @IsString()
  url: string;

  @ApiProperty({
    description:
      'The fields to upload the file with. These should be sent as form data.',
    example: { key: 'value' },
  })
  @IsObject()
  fields: Record<string, string>;
}
