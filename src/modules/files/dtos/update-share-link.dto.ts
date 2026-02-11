import { PartialType } from '@nestjs/swagger';
import { PickType } from '@nestjs/mapped-types';
import { GenerateLinkDto } from './generate-link.dto';

export class UpdateShareLinkDto extends PartialType(
  PickType(GenerateLinkDto, ['description', 'expiresAt', 'password']),
) {}
