/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { type Request, type Response } from 'express';
import {
  Injectable,
  HttpStatus,
  CallHandler,
  NestInterceptor,
  ExecutionContext,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { Counter, Histogram } from 'prom-client';
import { catchError, tap } from 'rxjs/operators';

import { PrometheusService } from '../../core/prometheus/prometheus.service';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(private readonly prometheusService: PrometheusService) {
    this.httpRequestTotal = this.prometheusService.createCounter(
      'http_requests_total',
      'Total number of HTTP requests',
      ['method', 'path', 'status_code'],
    );

    this.httpRequestDuration = this.prometheusService.createHistogram(
      'http_request_duration_seconds',
      'HTTP request duration in seconds',
      ['method', 'path', 'status_code'],
      [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
    );

    this.httpErrorsTotal = this.prometheusService.createCounter(
      'http_errors_total',
      'Total number of HTTP errors',
      ['method', 'path', 'status_code', 'error_type'],
    );
  }

  private readonly httpRequestTotal: Counter<string>;
  private readonly httpRequestDuration: Histogram;
  private readonly httpErrorsTotal: Counter<string>;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const startTime = Date.now();
    const method = request.method;
    const path = this.getPath(request);

    return next.handle().pipe(
      tap(() => {
        if (path === '/metrics' || path === '/health') return;
        const response = context.switchToHttp().getResponse<Response>();
        const statusCode = response.statusCode;
        const duration = (Date.now() - startTime) / 1000;

        this.httpRequestTotal.inc({
          method,
          path,
          status_code: statusCode.toString(),
        });

        this.httpRequestDuration.observe(
          {
            method,
            path,
            status_code: statusCode.toString(),
          },
          duration,
        );

        if (statusCode >= 400) {
          const errorType = this.getErrorType(statusCode);
          this.httpErrorsTotal.inc({
            method,
            path,
            status_code: statusCode.toString(),
            error_type: errorType,
          });
        }
      }),
      catchError((error: unknown) => {
        const statusCode: number =
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          (error as any)?.status || HttpStatus.INTERNAL_SERVER_ERROR;

        const duration = (Date.now() - startTime) / 1000;

        this.httpRequestTotal.inc({
          method,
          path,
          status_code: statusCode.toString(),
        });

        this.httpRequestDuration.observe(
          {
            method,
            path,
            status_code: statusCode.toString(),
          },
          duration,
        );

        const errorType = this.getErrorType(statusCode);
        this.httpErrorsTotal.inc({
          method,
          path,
          status_code: statusCode.toString(),
          error_type: errorType,
        });

        return throwError(() => error);
      }),
    );
  }

  private getPath(request: Request): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const path = request?.route?.path as string;

    if (path) {
      return path;
    }

    return 'unknown';
  }

  private getErrorType(statusCode: number): string {
    if (statusCode >= 400 && statusCode < 500) {
      return 'client_error';
    }
    if (statusCode >= 500) {
      return 'server_error';
    }
    return 'unknown';
  }
}
