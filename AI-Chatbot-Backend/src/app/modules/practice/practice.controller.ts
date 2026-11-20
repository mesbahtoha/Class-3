import practiceService from '../../../services/practice/practice.service';

export const practiceController = {
  listBooks: async () => practiceService.listStudentBooks(),

  listChapters: async (bookId: string) => practiceService.listStudentChapters(bookId),

  listSets: async (filters: { bookId?: string; chapterIds?: string[]; questionType?: string; mode?: 'practice' | 'exam' }) =>
    practiceService.listStudentSets(filters),

  getSet: async (setId: string) => practiceService.getStudentSet(setId),

  startAttempt: async (
    userId: string,
    body: { setId: string; mode: 'practice' | 'exam'; chapters?: string[] }
  ) => {
    const attempt = await practiceService.startAttempt(userId, body.setId, body.mode, {
      chapters: (body.chapters ?? []).map((id) => ({ id, title: '', order: 0 })),
    });
    return attempt;
  },

  getAttempt: async (userId: string, attemptId: string) => {
    const { attempt, evaluation, duplicate, autoSubmitted } = await practiceService.getAttempt(userId, attemptId);
    return { attempt, evaluation, duplicate, autoSubmitted };
  },

  saveAnswers: async (userId: string, attemptId: string, answers: Array<{ questionId: string; value: unknown }>) => {
    const { attempt, autoSubmitted } = await practiceService.saveAnswers(userId, attemptId, answers);
    return { attempt, autoSubmitted };
  },

  listAttempts: async (userId: string, filters: { mode?: 'practice' | 'exam'; limit?: number } = {}) => {
    const attempts = await practiceService.listAttempts(userId, filters);
    return { attempts };
  },

  submitAttempt: async (userId: string, attemptId: string, answers: Array<{ questionId: string; value: unknown }>) => {
    const { attempt, evaluation, duplicate, autoSubmitted } = await practiceService.submitAttempt(userId, attemptId, answers);
    return { attempt, evaluation, duplicate, autoSubmitted };
  },
};

export default practiceController;
