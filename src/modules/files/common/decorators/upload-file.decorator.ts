import { memoryStorage } from 'multer';

import { FileInterceptor } from '@nestjs/platform-express';
import {
  applyDecorators,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';

import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../constants';

export function UploadFile() {
  return applyDecorators(
    UseInterceptors(
      FileInterceptor('file', {
        storage: memoryStorage(),
        limits: {
          fields: 2,
          fileSize: MAX_FILE_SIZE_BYTES,
        },
        fileFilter: (_, file, cb) => {
          if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            return cb(new BadRequestException('Invalid file type'), false);
          }

          return cb(null, true);
        },
      }),
    ),
  );
}
