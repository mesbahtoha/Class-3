import { Router } from 'express';
import docsController from './docs.controller';

const router = Router();

router.get('/meta', docsController.meta);
router.get('/content', docsController.content);
router.get('/stats', docsController.stats);
router.get('/media/:memberId', docsController.media);

export default router;
