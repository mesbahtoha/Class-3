import { z } from 'zod';
import { DOCS_FEATURE_STATUSES, DOCS_ROADMAP_CATEGORIES } from '../../../constants';
import { isValidTimezone } from '../../../services/docs/docsContent.service';

const pitchBlockSchema = z.object({
  id: z.string().min(1).max(64),
  heading: z.string().max(120),
  body: z.array(z.string().max(2000)).max(20),
});

const pitchBlockListSchema = z.array(pitchBlockSchema).max(30);

const featureRowSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(600),
  status: z.enum(DOCS_FEATURE_STATUSES),
  route: z.string().max(200).optional(),
});

const roadmapEntrySchema = z.object({
  category: z.enum(DOCS_ROADMAP_CATEGORIES),
  item: z.string().min(1).max(100),
  description: z.string().max(300),
});

const changelogEntrySchema = z.object({
  version: z.string().min(1).max(20),
  date: z.string().max(20),
  title: z.string().min(1).max(120),
  items: z.array(z.string().max(300)).max(30),
});

const teamMemberBaseSchema = z.object({
  name: z.string().min(1).max(100),
  role: z.string().min(1).max(80),
  contact: z.string().min(1).max(100),
});

export const teamMemberSchema = teamMemberBaseSchema.extend({
  avatarId: z.string().max(64).optional(),
});

export const teamMemberPatchSchema = teamMemberBaseSchema.partial().extend({
  avatarId: z.string().max(64).optional(),
});

export const saveDraftSchema = z.object({
  pitchDeck: pitchBlockListSchema.optional(),
  productOverview: pitchBlockListSchema.optional(),
  featureMatrix: z.array(featureRowSchema).max(30).optional(),
  roadmap: z.array(roadmapEntrySchema).max(30).optional(),
  changelog: z.array(changelogEntrySchema).max(20).optional(),
});

const parseableDate = (value: string) => !Number.isNaN(Date.parse(value));

export const scheduleSchema = z
  .object({
    start: z.string().refine(parseableDate, 'start must be a parseable date').nullable(),
    end: z.string().refine(parseableDate, 'end must be a parseable date').nullable(),
    timezone: z.string().min(1).max(50).refine(isValidTimezone, 'Invalid IANA timezone'),
  })
  .refine((data) => !(data.start && data.end && Date.parse(data.start) > Date.parse(data.end)), {
    message: 'start must be on or before end',
  });

export const restoreVersionSchema = z.object({
  version: z.coerce.number().int().min(1),
});

export const enabledSchema = z.object({
  enabled: z.boolean(),
});
