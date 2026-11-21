import { createApp } from './app';
import env from './config/env';
import { connectDatabase, disconnectDatabase, runBootJobs } from './config/db';
import { log } from './config/logger';

/**
 * Application entry point.
 * Connects to MongoDB (with indexes + seeding), then starts the server.
 */

process.on('uncaughtException', (error) => {
  log.error('Uncaught exception', { message: error.message, stack: error.stack });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log.error('Unhandled rejection', { reason: String(reason) });
});

async function startServer(): Promise<void> {
  try {
    await connectDatabase();

    const app = createApp();

    const server = app.listen(env.port, '0.0.0.0', () => {
      log.info(`Server running on port ${env.port} (${env.nodeEnv})`);
      // Detached and time-bounded: creates indexes and seeds defaults without
      // delaying the first request (important on serverless cold starts).
      runBootJobs();
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      log.info(`Received ${signal}, shutting down gracefully...`);
      server.close(async () => {
        await disconnectDatabase();
        process.exit(0);
      });

      // Force exit if graceful shutdown takes too long
      setTimeout(() => process.exit(1), 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    log.error('Startup failed', { message: (error as Error).message, stack: (error as Error).stack });
    process.exit(1);
  }
}

startServer();
