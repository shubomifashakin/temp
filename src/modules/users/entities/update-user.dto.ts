import { PickType } from '@nestjs/swagger';

import { CachedUserInfo } from './user.dto';

export class UpdateUserDto extends PickType(CachedUserInfo, [
  'name',
] as const) {}
