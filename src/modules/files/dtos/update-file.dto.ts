import { PickType, PartialType } from '@nestjs/swagger';

import { UploadFileDto } from './upload-file.dto';

export class UpdateFileDto extends PartialType(
  PickType(UploadFileDto, ['description', 'name']),
) {}
