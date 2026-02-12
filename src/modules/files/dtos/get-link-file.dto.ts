import { PickType } from '@nestjs/swagger';

import { CreateLinkDto } from './create-link.dto';

export class GetLinkFileDto extends PickType(CreateLinkDto, ['password']) {}
