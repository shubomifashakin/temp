import { PartialType } from '@nestjs/swagger';
import { PickType } from '@nestjs/mapped-types';

import { CreateLinkDto } from './create-link.dto';

export class UpdateLinkDto extends PartialType(
  PickType(CreateLinkDto, ['description', 'expiresAt', 'password']),
) {}
