import { Router } from 'express';
import authRoutes from '../app/modules/auth/auth.routes';
import userRoutes from '../app/modules/user/user.routes';
import conversationRoutes from '../app/modules/conversation/conversation.routes';
import adminRoutes from '../app/modules/admin/admin.routes';
import attachmentRoutes from '../app/modules/attachment/attachment.routes';
import booksRoutes from '../app/modules/books/books.routes';
import tutorRoutes from '../app/modules/tutor/tutor.routes';

/**
 * Versioned API router (/api/v1).
 */
const v1Router = Router();

v1Router.use('/auth', authRoutes);
v1Router.use('/users', userRoutes);
v1Router.use('/conversations', conversationRoutes);
v1Router.use('/admin', adminRoutes);
v1Router.use('/attachments', attachmentRoutes);
v1Router.use('/books', booksRoutes);
v1Router.use('/tutor', tutorRoutes);

v1Router.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', time: new Date().toISOString() });
});

export default v1Router;
