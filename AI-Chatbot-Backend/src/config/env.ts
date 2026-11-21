import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Centralized, typed access to environment variables.
 * All process.env reads happen here so the rest of the app
 * never touches process.env directly (Single Responsibility).
 */
const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  isDevelopment: (process.env.NODE_ENV || 'development') !== 'production',

  port: Number(process.env.PORT || 3000),
  appBaseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  appTitle: process.env.APP_TITLE || 'AI Chatbot',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  dbName: process.env.DB_NAME || 'ChatBot_DB',
  mongoUri: process.env.MONGO_URI || '',
  vectorIndexName: process.env.VECTOR_INDEX_NAME || 'notice_vector_index',

  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    model: process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite',
    maxTokens: Number(process.env.OPENROUTER_MAX_TOKENS || 700),
  },

  ocr: {
    provider: (process.env.OCR_PROVIDER || 'hybrid') as 'tesseract' | 'vision' | 'hybrid',
    visionModel: process.env.OCR_VISION_MODEL || 'google/gemini-2.5-flash',
    visionThreshold: Number(process.env.OCR_VISION_THRESHOLD || 62),
    concurrency: Math.max(1, Math.min(4, Number(process.env.OCR_CONCURRENCY || 3))),
    scale: Number(process.env.OCR_SCALE || 3),
    maxTokens: Math.max(400, Math.min(4000, Number(process.env.OCR_MAX_TOKENS || 1800))),
    cacheRoot: process.env.OCR_CACHE_DIR || path.join(process.cwd(), '.cache', 'ocr'),
  },

  tutor: {
    provider: process.env.AI_PROVIDER || 'openrouter',
    model: process.env.AI_MODEL || process.env.OPENROUTER_MODEL || 'google/gemini-2.5-flash-lite',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 45000),
    guestPerMin: Number(process.env.GUEST_CHAT_PER_MIN || 10),
    uploadMaxMb: Number(process.env.BOOK_UPLOAD_MAX_MB || 60),
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@gmail.com',
    password: process.env.ADMIN_PASSWORD || 'admin123',
    name: process.env.ADMIN_NAME || 'Administrator',
  },

  quota: {
    dailyPerUser: Number(process.env.DAILY_QUOTA_PER_USER || 40000),
    monthlyPerUser: Number(process.env.MONTHLY_QUOTA_PER_USER || 0),
  },

  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'AI Chatbot <no-reply@example.com>',
  },
};

export default env;
