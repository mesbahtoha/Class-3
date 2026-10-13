import bcrypt from 'bcryptjs';
import env from '../config/env';
import { AdminModel, SettingModel, PromptTemplateModel } from './models';
import { DEFAULT_SETTINGS, DEFAULT_PROMPT_TEMPLATES } from '../constants';
import { log } from '../config/logger';

/**
 * Seeds the database on boot:
 *  1. Default admin (admin@gmail.com / admin123) - only when no admin exists.
 *  2. Default settings (only missing keys are inserted, never overwrite).
 *  3. Default prompt templates (only when none exist).
 */
export async function seedDatabase(): Promise<void> {
  await seedAdmin();
  await seedSettings();
  await seedPromptTemplates();
}

async function seedAdmin(): Promise<void> {
  // Legacy cleanup: remove old admin records that have no password hash
  // (created by the original app without any auth) - they are unusable.
  await AdminModel.deleteMany({ passwordHash: { $exists: false } });
  await AdminModel.deleteMany({ passwordHash: '' });

  const email = env.admin.email.toLowerCase().trim();
  const existing = await AdminModel.findOne({ email });

  if (existing) {
    // Ensure the default admin is active even if it was disabled.
    await AdminModel.updateOne(
      { _id: existing._id },
      { $set: { isActive: true } }
    );
    return;
  }

  const passwordHash = bcrypt.hashSync(env.admin.password, 10);
  const admin = await AdminModel.create({
    name: env.admin.name,
    email,
    passwordHash,
    role: 'superadmin',
    isActive: true,
    lastLoginAt: null,
  });

  log.info('Default admin seeded', { email: admin.email });
}

async function seedSettings(): Promise<void> {
  // Insert-only for missing keys so existing deployments gain new tutor keys
  // without overwriting admin-customized values.
  const existing = await SettingModel.find().select('key').lean();
  const have = new Set(existing.map((d) => d.key));
  const missing = Object.entries(DEFAULT_SETTINGS)
    .filter(([key]) => !have.has(key))
    .map(([key, value]) => ({ key, value, group: key.split('.')[0], description: '' }));
  if (missing.length) {
    await SettingModel.insertMany(missing);
    log.info('Missing settings seeded', { count: missing.length });
  }
}

async function seedPromptTemplates(): Promise<void> {
  const existingCount = await PromptTemplateModel.countDocuments();
  if (existingCount > 0) return;

  await PromptTemplateModel.insertMany(
    (DEFAULT_PROMPT_TEMPLATES as readonly { name: string; key: string; description: string; content: string; isActive: boolean; isDefault: boolean }[]).map(
      (template) => ({ ...template })
    )
  );
  log.info('Default prompt templates seeded');
}