// common/interceptors/subscription-plan.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { DatabaseService } from '../../core/database/database.service';
import { Request } from 'express';

@Injectable()
export class SubscriptionPlanInterceptor implements NestInterceptor {
  constructor(private readonly databaseService: DatabaseService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest<Request>();
    const userId = request.user?.id;

    if (userId) {
      const subscription = await this.databaseService.subscription.findFirst({
        where: {
          user_id: userId,
          status: 'ACTIVE',
        },
        select: {
          plan: true,
        },
        orderBy: {
          last_event_at: 'desc',
        },
      });

      request.user.plan = subscription?.plan || 'FREE';
    } else {
      request.user = request.user || {};
      request.user.plan = 'FREE';
    }

    return next.handle();
  }
}
