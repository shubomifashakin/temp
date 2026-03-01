import 'express';

import { EventType } from '@polar-sh/sdk/models/operations/webhookslistwebhookdeliveries';
import { Order } from '@polar-sh/sdk/models/components/order.js';
import { Subscription } from '@polar-sh/sdk/models/components/subscription.js';
import { Plan } from '../../generated/prisma/enums';

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    rawBody: string;
    user: { id: string; plan?: Plan };
    polarEvent?: {
      type: EventType;
      data: Order | Subscription;
      timestamp: Date;
    };
  }
}
