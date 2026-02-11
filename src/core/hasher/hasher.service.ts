import { Injectable } from '@nestjs/common';

import * as argon2 from 'argon2';

import { makeError } from '../../common/utils';
import { FnResult } from '../../types/common.types';

@Injectable()
export class HasherService {
  async hashPassword(password: string): Promise<FnResult<string>> {
    try {
      const hash = await argon2.hash(password);

      return { success: true, data: hash, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }

  async verifyPassword(
    password: string,
    hash: string,
  ): Promise<FnResult<boolean>> {
    try {
      const result = await argon2.verify(hash, password);

      return { success: true, data: result, error: null };
    } catch (error) {
      return { success: false, data: null, error: makeError(error) };
    }
  }
}
