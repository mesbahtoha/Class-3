import { Router } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { requireAdmin } from '../../../middleware/role.middleware';
import { validate } from '../../../middleware/validate.middleware';
import adminPracticeController from './admin-practice.controller';
import {
  createQuestionSetSchema,
  updateQuestionSetSchema,
  questionInputSchema,
  reorderQuestionsSchema,
} from '../../../services/practice/admin.service';

const router = Router();

router.use(authenticate, requireAdmin);

// Question sets
router.get('/sets', adminPracticeController.listSets);
router.post('/sets', validate(createQuestionSetSchema, 'body'), adminPracticeController.createSet);
router.get('/sets/:id', adminPracticeController.getSet);
router.patch('/sets/:id', validate(updateQuestionSetSchema, 'body'), adminPracticeController.updateSet);
router.delete('/sets/:id', adminPracticeController.deleteSet);
router.post('/sets/:id/duplicate', adminPracticeController.duplicateSet);
router.post('/sets/:id/publish', adminPracticeController.publishSet);
router.post('/sets/:id/unpublish', adminPracticeController.unpublishSet);
router.post('/sets/:id/preview', adminPracticeController.previewSet);

// Questions inside a set
router.get('/sets/:id/questions', adminPracticeController.listQuestions);
router.post('/sets/:id/questions', validate(questionInputSchema, 'body'), adminPracticeController.createQuestion);
router.patch('/sets/:id/questions/order', validate(reorderQuestionsSchema, 'body'), adminPracticeController.reorderQuestions);
router.patch('/sets/:id/questions/:questionId', validate(questionInputSchema, 'body'), adminPracticeController.updateQuestion);
router.delete('/sets/:id/questions/:questionId', adminPracticeController.deleteQuestion);
router.post('/sets/:id/questions/:questionId/duplicate', adminPracticeController.duplicateQuestion);

export default router;
