import { Response } from 'express';

import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';

import { PrismaClientUnknownRequestError } from '@prisma/client/runtime/client';

@Catch(PrismaClientUnknownRequestError)
export class PrismaClientUnknownRequestFilterFilter implements ExceptionFilter {
  logger = new Logger(PrismaClientUnknownRequestFilterFilter.name);

  catch(exception: PrismaClientUnknownRequestError, host: ArgumentsHost) {
    if (host.getType() === 'http') {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();

      this.logger.error({
        message: exception?.message,
        stack: exception?.stack,
      });

      return response.status(500).json({
        statusCode: 500,
        message: 'Internal Server Error',
      });
    }
  }
}
