import mongoose from 'mongoose';
import env from './env';
import { log } from './logger';
import { ensureIndexes } from '../database/indexes';
import { seedDatabase } from '../database/seeders';

let isConnected = false;
let bootJobsStarted = false;

/**
 * Establishes the MongoDB connection using Mongoose.
 * Reuses an existing connection when possible (serverless-safe).
 *
 * Note: index creation + seeding are intentionally NOT part of the
 * connection hot path (they previously blocked every cold-start request
 * and caused Vercel 504 timeouts). They run detached via runBootJobs().
 */
export async function connectDatabase(): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  mongoose.set('strictQuery', true);

  mongoose.connection.on('connected', () => {
    log.info('MongoDB connected');
  });

  mongoose.connection.on('error', (error) => {
    log.error('MongoDB connection error', { message: error.message });
  });

  mongoose.connection.on('disconnected', () => {
    log.warn('MongoDB disconnected');
    isConnected = false;
  });

  if (!env.mongoUri) {
    throw new Error('MONGO_URI is missing in .env');
  }

  await mongoose.connect(env.mongoUri, {
    dbName: env.dbName,
    serverSelectionTimeoutMS: 15000,
  });

  isConnected = true;

  await mongoose.connection.db?.command({ ping: 1 });

  return mongoose;
}

/**
 * Runs idempotent boot jobs (index creation + default seeding) once per
 * process instance, detached from the request path and bounded by a hard
 * timeout so a slow MongoDB can never take a request down with it.
 */
export function runBootJobs(): void {
  if (bootJobsStarted) return;
  bootJobsStarted = true;

  const job = (async () => {
    await ensureIndexes();
    await seedDatabase();
    log.info('Boot jobs completed (indexes + seed)');
  })();

  let finished = false;
  const timer = setTimeout(() => {
    if (finished) return;
    log.warn('Boot jobs timed out after 20s (continuing without them)');
  }, 20_000);
  timer.unref?.();
  Promise.race([job, new Promise<void>((resolve) => setTimeout(resolve, 20_000))])
    .catch((error: unknown) => {
      log.error('Boot jobs failed', { message: error instanceof Error ? error.message : String(error) });
    })
    .finally(() => {
      finished = true;
      clearTimeout(timer);
    });
}

/** Returns the underlying native MongoDB Db (used for GridFS + raw queries). */
export function getDb() {
  return mongoose.connection.db;
}

/** Disconnects cleanly (used in tests / graceful shutdown). */
export async function disconnectDatabase(): Promise<void> {
  isConnected = false;
  await mongoose.disconnect();
}

export default connectDatabase;
