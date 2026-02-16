import { Request } from 'express';

import { validate } from 'class-validator';
import {
  Logger,
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';

import { PLAN_INFO } from '../constants';
import { UploadFileDto } from '../../dtos/upload-file.dto';
import { DatabaseService } from '../../../../core/database/database.service';

@Injectable()
export class FileUploadGuard implements CanActivate {
  private readonly logger = new Logger(FileUploadGuard.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request?.user?.id;
    const requestBody = request.body as UploadFileDto;

    const dto = new UploadFileDto();
    Object.assign(dto, request.body);
    const isValidObject = await validate(dto);

    if (isValidObject.length) {
      const firstError = isValidObject[0];

      let message = 'Invalid Payload';

      if (firstError?.constraints) {
        message = Object.values(firstError.constraints)[0];
      }

      throw new BadRequestException(message);
    }

    if (!userId) {
      throw new UnauthorizedException();
    }

    const contentLength = request.headers['content-length'];

    if (!contentLength) {
      this.logger.error({
        message: 'Content length is not present',
        error: new Error('Content length is missing in headers'),
      });

      throw new BadRequestException('Content length header is required');
    }

    const sizeOfFileUploaded = parseInt(contentLength);

    const usersSubscription = await this.databaseService.subscription.findFirst(
      {
        where: {
          user_id: userId,
          status: 'ACTIVE',
        },
        select: {
          plan: true,
          status: true,
        },
      },
    );

    if (
      !usersSubscription ||
      !usersSubscription.plan ||
      usersSubscription.plan === 'FREE'
    ) {
      const maxInMb = PLAN_INFO['FREE'].MAX_FILE_SIZE_MB;
      const maxSizeForFree = PLAN_INFO['FREE'].MAX_FILE_SIZE_BYTES;
      const allowedLifetimes = PLAN_INFO['FREE'].ALLOWED_LIFETIMES;

      if (sizeOfFileUploaded > maxSizeForFree) {
        throw new BadRequestException(`File exceeds ${maxInMb}MB limit`);
      }

      if (!allowedLifetimes.includes(requestBody.lifetime)) {
        throw new BadRequestException(
          `Free plan does not support this lifetime`,
        );
      }

      return true;
    }

    if (usersSubscription.plan === 'PRO') {
      const maxInMb = PLAN_INFO['PRO'].MAX_FILE_SIZE_MB;
      const maxSizeForPro = PLAN_INFO['PRO'].MAX_FILE_SIZE_BYTES;
      const allowedLifetimes = PLAN_INFO['PRO'].ALLOWED_LIFETIMES;

      if (sizeOfFileUploaded > maxSizeForPro) {
        throw new BadRequestException(`File exceeds ${maxInMb}MB limit`);
      }

      if (!allowedLifetimes.includes(requestBody.lifetime)) {
        throw new BadRequestException(
          `Pro plan does not support this lifetime`,
        );
      }

      return true;
    }

    return false;
  }
}
