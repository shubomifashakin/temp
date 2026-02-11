import { PickType } from '@nestjs/swagger';

import { UploadFileDto } from './upload-file.dto';

export class UpdateFileDto extends PickType(UploadFileDto, ['description']) {}
