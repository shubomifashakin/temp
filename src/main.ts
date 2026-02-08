import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ShutdownSignal, ValidationPipe, VersioningType } from '@nestjs/common';

import { Logger } from 'nestjs-pino';

import cookieParser from 'cookie-parser';

import { AppModule } from './app.module';
import { PrismaClientKnownRequestFilterFilter } from './common/filters/prisma-client-known-request.filter';
import { PrismaClientUnknownRequestFilterFilter } from './common/filters/prisma-client-unknown-request.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      methods: '*',
      credentials: true,
      origin: 'http://localhost:3000',
    },
    bufferLogs: true,
  });

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Temp Api Docs')
      .setDescription('The Temp api documentation')
      .setVersion('1.0')
      .addCookieAuth('access_token')
      .build();

    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, documentFactory);
  }

  app.useLogger(app.get(Logger));

  app.use(cookieParser());
  app.set('trust proxy', true);

  app.enableVersioning({
    defaultVersion: '1',
    type: VersioningType.URI,
  });
  app.setGlobalPrefix('api', { exclude: ['health', 'metrics'] });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      stopAtFirstError: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks([ShutdownSignal.SIGINT, ShutdownSignal.SIGTERM]);
  app.useGlobalFilters(
    new PrismaClientKnownRequestFilterFilter(),
    new PrismaClientUnknownRequestFilterFilter(),
  );

  await app.listen(3000);
}
bootstrap();
