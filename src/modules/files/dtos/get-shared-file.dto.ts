import { PickType } from '@nestjs/swagger';

import { GenerateLinkDto } from './generate-link.dto';

export class GetSharedFile extends PickType(GenerateLinkDto, ['password']) {}
