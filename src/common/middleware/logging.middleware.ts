import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class LoggingMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    const { ip, method, originalUrl: url } = request;
    const userAgent = request.get('User-Agent') || '';
    const startTime = Date.now();

    response.on('close', () => {
      const { statusCode } = response;
      const contentLength = response.get('Content-Length');
      const responseTime = Date.now() - startTime;

      this.logger.log(
        `${method} ${url} ${statusCode} ${contentLength || 0}b - ${responseTime}ms - ${userAgent} ${ip}`,
      );
    });

    next();
  }
}