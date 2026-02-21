import {
  Logger,
  Injectable,
  ExecutionContext,
  BadRequestException,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request } from 'express';
import { DatabaseService } from '../../../../core/database/database.service';

@Injectable()
export class CreateLinkGuard {
  private readonly logger = new Logger(CreateLinkGuard.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<Request>();
    const userId = req.user.id;
    const fileId = req.params.id;

    if (!userId) {
      this.logger.debug({
        message: 'the user is not authorized',
      });

      throw new UnauthorizedException();
    }

    if (!fileId || fileId?.[0] === undefined) {
      this.logger.error({
        message: 'fileId is not in params',
        error: new Error('id is not params'),
      });
      throw new InternalServerErrorException();
    }

    const usersSubscription = await this.databaseService.subscription.findFirst(
      {
        where: {
          userId: userId,
          status: 'active',
          NOT: {
            plan: 'free',
          },
        },
      },
    );

    const isSubscribed = usersSubscription !== null;

    if (isSubscribed) return true;

    const numberOfActiveLinks = await this.databaseService.link.count({
      where: {
        fileId: typeof fileId === 'string' ? fileId : fileId[0],
        OR: [
          {
            expiresAt: {
              gt: new Date(),
            },
          },
          {
            expiresAt: null,
          },
        ],
        revokedAt: {
          equals: null,
        },
      },
    });

    if (numberOfActiveLinks) {
      this.logger.debug({
        message:
          'the user has reached the maximum number of active links for this file',
      });

      throw new BadRequestException(
        'You have reached the maximum number of active links for this file, please upgrade your plan to create more links',
      );
    }

    return true;
  }
}
