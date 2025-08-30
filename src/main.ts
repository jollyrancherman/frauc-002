import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Global exception filter
  app.useGlobalFilters(new AllExceptionsFilter());
  
  // Global response interceptor
  app.useGlobalInterceptors(new ResponseInterceptor());
  
  // Global validation pipe
  app.useGlobalPipes(new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) => {
      const messages = errors.map(error => {
        const constraints = error.constraints;
        return constraints ? Object.values(constraints).join(', ') : error.property;
      });
      return new Error(`Validation failed: ${messages.join('; ')}`);
    },
  }));

  // CORS configuration
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);
  
  console.log(`Application is running on: http://localhost:${port}`);
}

bootstrap();