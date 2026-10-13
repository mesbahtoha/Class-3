import type { ReactElement } from 'react';
import type { Citation, Source } from '@/types';
import { API_BASE_URL } from '@/lib/api';
import {
  FaExternalLinkAlt,
  FaFileAlt,
  FaFileExcel,
  FaFileImage,
  FaFilePdf,
  FaFilePowerpoint,
  FaFileWord,
} from 'react-icons/fa';

interface FileRef {
  key: string;
  fileUrl: string;
  fullNoticeUrl?: string | null;
  title: string;
  mimeType?: string | null;
}

function fileInfo(mimeType?: string | null): { label: string; icon: ReactElement } {
  const mime = (mimeType || '').toLowerCase();
  if (mime.includes('pdf')) return { label: 'PDF', icon: <FaFilePdf size={13} /> };
  if (mime.startsWith('image/')) return { label: 'IMG', icon: <FaFileImage size={13} /> };
  if (mime.includes('powerpoint') || mime.includes('presentation')) {
    return { label: 'PPT', icon: <FaFilePowerpoint size={13} /> };
  }
  if (mime.includes('word') || mime.includes('document')) return { label: 'DOCX', icon: <FaFileWord size={13} /> };
  if (mime.includes('sheet') || mime.includes('excel')) return { label: 'XLSX', icon: <FaFileExcel size={13} /> };
  return { label: 'FILE', icon: <FaFileAlt size={13} /> };
}

export function Citations({ citations, sources }: { citations?: Citation[]; sources?: Source[] }) {
  const refs = new Map<string, FileRef>();

  // Textbook citations carry real book/chapter/page metadata (often without a
  // public file URL ,  book files stay private unless distribution is allowed).
  const bookRefs = (citations ?? []).filter(
    (c) => (c.kind === 'book' || c.bookTitle) && !c.fileUrl
  );

  for (const citation of citations ?? []) {
    if (!citation.fileUrl) continue;
    refs.set(citation.fileUrl, {
      key: citation.fileUrl,
      fileUrl: citation.fileUrl,
      fullNoticeUrl: citation.fullNoticeUrl,
      title: citation.title || 'Notice file',
      mimeType: citation.mimeType,
    });
  }

  for (const source of sources ?? []) {
    if (!source.fileUrl) continue;
    if (!refs.has(source.fileUrl)) {
      refs.set(source.fileUrl, {
        key: source.fileUrl,
        fileUrl: source.fileUrl,
        fullNoticeUrl: source.fullNoticeUrl,
        title: source.title || 'Notice file',
        mimeType: source.mimeType,
      });
    } else {
      const existing = refs.get(source.fileUrl)!;
      if (existing.title === 'Notice file' && source.title) existing.title = source.title;
    }
  }

  const unique = Array.from(refs.values());
  if (!unique.length && !bookRefs.length) return null;

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '2px solid #E2E8F0' }}>
      <div className="text-xs font-semibold text-muted mb-2">Sources</div>
      {bookRefs.length > 0 && (
        <div className="flex flex-col" style={{ gap: 4, marginBottom: unique.length ? 8 : 0 }}>
          {bookRefs.map((c, i) => (
            <span key={`${c.chunkId ?? i}`} className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Book: {c.bookTitle || c.title}
              {c.chapterTitle ? `, Chapter: ${c.chapterTitle}` : ''}
              {c.pageStart ? `, Page ${c.pageStart}${c.pageEnd && c.pageEnd !== c.pageStart ? ` to ${c.pageEnd}` : ''}` : ''}
            </span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap" style={{ gap: 8 }}>
        {unique.map((ref) => {
          const file = fileInfo(ref.mimeType);
          return (
            <a
              key={ref.key}
              href={API_BASE_URL + ref.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="badge"
              title={ref.title}
              style={{
                textDecoration: 'none',
                gap: 6,
                background: 'var(--bg-surface-2)',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-color)',
                padding: '5px 12px',
                fontSize: 12.5,
              }}
            >
              {file.icon}
              {file.label}
              <span className="ellipsis" style={{ maxWidth: 180 }}>{ref.title}</span>
              {ref.fullNoticeUrl && <FaExternalLinkAlt size={10} style={{ opacity: 0.6 }} />}
            </a>
          );
        })}
      </div>
    </div>
  );
}
