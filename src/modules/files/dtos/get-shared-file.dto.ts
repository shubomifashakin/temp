import { PickType } from '@nestjs/swagger';

import { CreateLinkDto } from './create-link.dto';

export class GetSharedFile extends PickType(CreateLinkDto, ['password']) {}
