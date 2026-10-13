import { BookModel } from '../database/models/Book.model';
import { BookChunkModel } from '../database/models/BookChunk.model';
import { IngestionJobModel } from '../database/models/IngestionJob.model';

export const bookRepository = {
  listPublished(filter: { subject?: string; grade?: string; curriculum?: string; search?: string }) {
    const q: Record<string, unknown> = { publicationState: 'published' };
    if (filter.subject) q.subject = filter.subject;
    if (filter.grade) q.grade = filter.grade;
    if (filter.curriculum) q.curriculum = filter.curriculum;
    if (filter.search) q.title = { $regex: filter.search, $options: 'i' };
    return BookModel.find(q).sort({ subject: 1, title: 1 }).limit(100).lean();
  },
  findPublishedById(id: string) {
    return BookModel.findOne({ _id: id, publicationState: 'published' }).lean();
  },
  previewChunks(bookId: string, limit = 10) {
    return BookChunkModel.find({ bookId }).sort({ chunkIndex: 1 }).limit(limit).lean();
  },
  jobsForBook(bookId: string, limit = 5) {
    return IngestionJobModel.find({ bookId }).sort({ createdAt: -1 }).limit(limit).lean();
  },
};

export default bookRepository;
