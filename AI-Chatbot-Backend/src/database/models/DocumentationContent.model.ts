import mongoose, { Schema } from 'mongoose';
import type { DocsFeatureStatus, DocsRoadmapCategory } from '../../constants';

/**
 * Documentation content shapes + the DocumentationContent model.
 * The documentation site is admin-managed: a single DocumentationContent
 * document holds the current editable draft plus the published state; every
 * published version is preserved in DocumentationVersion.
 */

export interface DocsBlock {
  id: string;
  heading: string;
  body: string[];
}

export interface DocsTeamMember {
  id: string;
  name: string;
  role: string;
  contact: string;
  avatarId?: string;
  isConfirmed?: boolean;
}

export interface DocsSettings {
  enabled?: boolean;
  start?: Date | null;
  end?: Date | null;
  timezone?: string;
}

export interface DocsFeatureRow {
  name: string;
  description: string;
  status: DocsFeatureStatus;
  route?: string;
}

export interface DocsRoadmapEntry {
  category: DocsRoadmapCategory;
  item: string;
  description: string;
}

export interface DocsChangelogEntry {
  version: string;
  date: string; // ISO date string, e.g. "2026-11-20"
  title: string;
  items: string[];
}

/** The editable documentation draft (what admins save via the CMS). */
export interface DocsDraft {
  settings: DocsSettings;
  pitchDeck: DocsBlock[];
  productOverview: DocsBlock[];
  featureMatrix: DocsFeatureRow[];
  roadmap: DocsRoadmapEntry[];
  teamMembers: DocsTeamMember[];
  changelog: DocsChangelogEntry[];
  draftVersion: number;
  publishedVersion: number;
}

export interface DocumentationContentDoc extends mongoose.Document {
  createdAt: Date;
  updatedAt: Date;
  settings: DocsSettings;
  pitchDeck: DocsBlock[];
  productOverview: DocsBlock[];
  featureMatrix: DocsFeatureRow[];
  roadmap: DocsRoadmapEntry[];
  teamMembers: DocsTeamMember[];
  changelog: DocsChangelogEntry[];
  draftVersion: number;
  publishedVersion: number;
  publishedAt: Date | null;
  publishedBy: string;
  updatedBy: string;
}

const documentationContentSchema = new Schema(
  {
    settings: { type: Object, default: () => ({ enabled: true, start: null, end: null, timezone: 'Asia/Dhaka' }) },
    pitchDeck: { type: Array, default: [] },
    productOverview: { type: Array, default: [] },
    featureMatrix: { type: Array, default: [] },
    roadmap: { type: Array, default: [] },
    teamMembers: { type: Array, default: [] },
    changelog: { type: Array, default: [] },
    draftVersion: { type: Number, default: 1 },
    publishedVersion: { type: Number, default: 0 },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true, collection: 'documentation_contents' }
);

export const DocumentationContentModel = mongoose.model('DocumentationContent', documentationContentSchema);

export default DocumentationContentModel;
