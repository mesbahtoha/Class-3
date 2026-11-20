import { Router } from 'express';
import docsAdminController from './docs.admin.controller';
import { uploadAvatar } from '../../../middleware/upload.middleware';
import { validate } from '../../../middleware/validate.middleware';
import {
  enabledSchema,
  restoreVersionSchema,
  saveDraftSchema,
  scheduleSchema,
  teamMemberPatchSchema,
  teamMemberSchema,
} from './docs.validation';

const router = Router();

// Draft + publish + schedule + versions
router.get('/docs', docsAdminController.get);
router.put('/docs', validate(saveDraftSchema, 'body'), docsAdminController.saveDraft);
router.post('/docs/publish', docsAdminController.publish);
router.post('/docs/unpublish', docsAdminController.unpublish);
router.put('/docs/schedule', validate(scheduleSchema, 'body'), docsAdminController.setSchedule);
router.get('/docs/versions', docsAdminController.listVersions);
router.post('/docs/versions/:version/restore', validate(restoreVersionSchema, 'params'), docsAdminController.restoreVersion);
router.put('/docs/enabled', validate(enabledSchema, 'body'), docsAdminController.setPublishingEnabled);

// Team management (confirmed members cannot be removed)
router.post('/docs/team', validate(teamMemberSchema, 'body'), uploadAvatar.single('avatar'), docsAdminController.addTeamMember);
router.patch('/docs/team/:memberId', validate(teamMemberPatchSchema, 'body'), docsAdminController.updateTeamMember);
router.delete('/docs/team/:memberId', docsAdminController.deleteTeamMember);

export default router;
