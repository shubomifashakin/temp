import { Response } from 'express';

import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';

import { PrismaClientKnownRequestError } from '@prisma/client/runtime/client';

@Catch(PrismaClientKnownRequestError)
export class PrismaClientKnownRequestFilterFilter implements ExceptionFilter {
  logger = new Logger(PrismaClientKnownRequestFilterFilter.name);

  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
    if (host.getType() === 'http') {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();

      if (exception.code === 'P2002') {
        const modelName =
          typeof exception?.meta?.modelName === 'string'
            ? exception.meta.modelName
            : 'Record';

        return response.status(409).json({
          statusCode: 409,
          message: `${modelName} already exists`,
        });
      }

      if (exception.code === 'P2025') {
        const modelName =
          typeof exception?.meta?.modelName === 'string'
            ? exception.meta.modelName
            : 'Record';

        return response.status(404).json({
          statusCode: 404,
          message: `${modelName} does not exist`,
        });
      }

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
