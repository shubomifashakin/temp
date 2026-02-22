import { ApiProperty } from '@nestjs/swagger';

import { IsUrl } from 'class-validator';

export class GetLinkFileResponse {
  @ApiProperty({
    description: 'URL for the linked file. User should be redirected here',
    example: 'https://temp.object.storage.com/12345',
  })
  @IsUrl()
  url: string;
}
