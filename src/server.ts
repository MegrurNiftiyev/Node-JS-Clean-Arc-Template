import { env } from '@/config/env';
import { buildContainer } from '@/container';
import { createApp } from '@/app';

async function main(): Promise<void> {
  const container = buildContainer(env);
  await container.init();
  const app = createApp(container);
  const server = app.listen(env.PORT, env.HOST, () => {
    container.logger.info(`Listening on http://${env.HOST}:${env.PORT}`);
    if (env.SWAGGER_ENABLED) {
      container.logger.info(`📚 Swagger API Docs: http://${env.HOST}:${env.PORT}/docs`);
    }
  });

  const shutdown = (signal: string): void => {
    container.logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref(); // force-exit if connections hang
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => { container.logger.fatal({ reason }, 'unhandledRejection'); process.exit(1); });
  process.on('uncaughtException', (err) => { container.logger.fatal({ err }, 'uncaughtException'); process.exit(1); });
}

void main();
