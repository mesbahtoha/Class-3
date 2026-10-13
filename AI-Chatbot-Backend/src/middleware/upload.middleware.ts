import multer from 'multer';

const NOTICE_ALLOWED = [
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
  'image/bmp',
];

const AVATAR_ALLOWED = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/jpg',
  'image/bmp',
];

/** Images (.jpg/.jpeg/.png/.webp) and PDF documents for temporary chat attachments. */
const CHAT_ATTACHMENT_ALLOWED_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
const CHAT_ATTACHMENT_ALLOWED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const chatAttachmentFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  const ext = file.originalname.split('.').pop()?.toLowerCase() ?? '';
  if (
    CHAT_ATTACHMENT_ALLOWED_MIME.has(file.mimetype) &&
    CHAT_ATTACHMENT_ALLOWED_EXT.includes(`.${ext}`)
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only images (.jpg, .jpeg, .png, .webp) and PDF (.pdf) files are allowed'));
  }
};

const noticeFileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (NOTICE_ALLOWED.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, TXT, JPEG, PNG, WEBP, JPG and BMP files are allowed'));
  }
};

const avatarFileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  if (AVATAR_ALLOWED.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WEBP, JPG, BMP) are allowed'));
  }
};

/** Multipart upload for notices (file + fields). */
export const uploadNoticeFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: noticeFileFilter,
});

/** Multipart upload for admin textbook PDFs (validated server-side by signature). */
export const uploadBookFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Only PDF books are supported in this version'));
  },
});

/** Multipart upload for avatars. */
export const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: avatarFileFilter,
});

/** Multipart upload for temporary chat attachments (memory only). */
export const uploadChatAttachments = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5,
  },
  fileFilter: chatAttachmentFilter,
});
