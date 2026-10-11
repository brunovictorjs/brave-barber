import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { AppConfig } from './config/app-config.service';

async function bootstrap() {
  // rawBody: o webhook do Stripe precisa do corpo original para validar a assinatura.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  const config = app.get(AppConfig);

  app.setGlobalPrefix('api', { exclude: ['uploads/(.*)'] });
  app.use(cookieParser());
  app.enableCors({ origin: config.get('WEB_URL').split(','), credentials: true });
  app.disable('x-powered-by');
  app.enableShutdownHooks();

  const port = config.get('PORT');
  await app.listen(port);
  Logger.log(`API da Brave Barber em http://localhost:${port}/api`, 'Bootstrap');
}

void bootstrap();
