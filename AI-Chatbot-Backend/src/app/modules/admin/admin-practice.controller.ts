import { asyncHandler, ok } from '../../../utils/response.utils';
import adminService, { CreateQuestionSetInput, QuestionInput } from '../../../services/practice/admin.service';

export const adminPracticeController = {
  listSets: asyncHandler(async (req, res) => {
    const result = await adminService.listSets({
      bookId: req.query.bookId ? String(req.query.bookId) : undefined,
      chapterIds: req.query.chapterIds ? String(req.query.chapterIds).split(',').filter(Boolean) : undefined,
      questionType: req.query.questionType ? String(req.query.questionType) : undefined,
      status: req.query.status ? String(req.query.status) : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
    });
    return ok(res, result);
  }),

  createSet: asyncHandler(async (req, res) => {
    const input = req.body as CreateQuestionSetInput;
    const result = await adminService.createSet(input);
    return ok(res, result, 201);
  }),

  getSet: asyncHandler(async (req, res) => {
    const { set, questions } = await adminService.getSet(String(req.params.id));
    return ok(res, { set, questions });
  }),

  updateSet: asyncHandler(async (req, res) => {
    const input = req.body;
    const { set, questions } = await adminService.updateSet(String(req.params.id), input);
    return ok(res, { set, questions });
  }),

  deleteSet: asyncHandler(async (req, res) => {
    const { deleted } = await adminService.deleteSet(String(req.params.id));
    return ok(res, { deleted });
  }),

  publishSet: asyncHandler(async (req, res) => {
    const { set } = await adminService.publishSet(String(req.params.id));
    return ok(res, { set });
  }),

  unpublishSet: asyncHandler(async (req, res) => {
    const { set } = await adminService.unpublishSet(String(req.params.id));
    return ok(res, { set });
  }),

  previewSet: asyncHandler(async (req, res) => {
    const { attempt } = await adminService.previewSet(String(req.params.id), req.user!.id);
    return ok(res, { attempt });
  }),

  listQuestions: asyncHandler(async (req, res) => {
    const questions = await adminService.listQuestions(String(req.params.id));
    return ok(res, { questions });
  }),

  createQuestion: asyncHandler(async (req, res) => {
    const { question, ...totals } = await adminService.createQuestion(String(req.params.id), req.body as QuestionInput);
    return ok(res, { question, ...totals });
  }),

  updateQuestion: asyncHandler(async (req, res) => {
    const { question, ...totals } = await adminService.updateQuestion(String(req.params.id), String(req.params.questionId), req.body as QuestionInput);
    return ok(res, { question, ...totals });
  }),

  deleteQuestion: asyncHandler(async (req, res) => {
    const { deleted, ...totals } = await adminService.deleteQuestion(String(req.params.id), String(req.params.questionId));
    return ok(res, { deleted, ...totals });
  }),

  duplicateQuestion: asyncHandler(async (req, res) => {
    const { question } = await adminService.duplicateQuestion(String(req.params.id), String(req.params.questionId));
    return ok(res, { question });
  }),
};

export default adminPracticeController;
