import { PartialType, PickType } from '@nestjs/swagger';

import { CreateLinkDto } from './create-link.dto';

export class UpdateLinkDto extends PartialType(
  PickType(CreateLinkDto, ['description', 'expiresAt', 'password']),
) {}
