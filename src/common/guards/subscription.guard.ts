import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { DatabaseService } from '../../core/database/database.service';
import { Request } from 'express';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly databaseService: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request?.user?.id;

    if (!userId) {
      return false;
    }

    const subscription = await this.databaseService.subscription.findFirst({
      where: {
        user_id: userId,
        status: 'ACTIVE',
      },
      select: {
        plan: true,
        status: true,
      },
      orderBy: {
        last_event_at: 'desc',
      },
    });

    request.user.plan = subscription?.plan || 'FREE';

    return true;
  }
}
