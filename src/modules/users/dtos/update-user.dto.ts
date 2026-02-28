import { PickType } from '@nestjs/swagger';

import { UserInfo } from './user.dto';

export class UpdateUserDto extends PickType(UserInfo, ['name'] as const) {}
