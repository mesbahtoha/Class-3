import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getBook, listBooks } from '@/lib/tutor';
import { useTutorStore } from '@/store/tutor.store';
import { useLang } from '@/lib/i18n';
import type { BookInfo } from '@/types';

export function BookDetailPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const setBookId = useTutorStore((s) => s.setBookId);
  const setSubject = useTutorStore((s) => s.setSubject);
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [book, setBook] = useState<BookInfo | null>(null);
  const [samples, setSamples] = useState<{ chunkId: string; chapterTitle?: string; pageStart?: number; pageEnd?: number; preview: string }[]>([]);
  const [related, setRelated] = useState<BookInfo[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bookId) return;
    getBook(bookId)
      .then((r) => { setBook(r.book); setSamples(r.samples ?? []); })
      .catch(() => setError(bn ? 'বইটি পাওয়া যায়নি।' : 'Book not found.'));
    listBooks().then((all) => setRelated(all.filter((b) => b._id !== bookId).slice(0, 3))).catch(() => setRelated([]));
  }, [bookId, bn]);

  if (error) {
    return (
      <div className="pg-app" style={{ padding: 24 }}>
        <div className="pg-container" style={{ maxWidth: 720 }}>
          <p>Note: {error}</p>
          <Link to="/books" className="pg-btn-secondary">{bn ? 'সব বই' : 'All books'}</Link>
        </div>
      </div>
    );
  }
  if (!book) return <div className="pg-app" style={{ padding: 24 }}><div className="pg-container"><div className="skeleton skeleton-title" /><div className="skeleton skeleton-text" /><div className="skeleton skeleton-text short" /></div></div>;

  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 860, paddingTop: 24 }}>
        <Link to="/books" className="pg-btn-secondary">{bn ? 'সব বই' : 'All books'}</Link>
        <div className="pg-card pg-card-yellow-shadow" style={{ padding: 24, marginTop: 14 }}>
          <span className="pg-badge pg-badge-mint">{book.subject}</span>
          <h1 style={{ fontSize: 30, margin: '10px 0 4px' }}>{book.title}</h1>
          <p className="muted">{book.subject}, {book.grade}, {book.curriculum}{book.edition ? `, ${book.edition}` : ''}</p>
          <div className="key-grid">
            {[
              [bn ? 'বিষয়' : 'Subject', book.subject],
              [bn ? 'শ্রেণি' : 'Grade', book.grade],
              [bn ? 'কারিকুলাম' : 'Curriculum', book.curriculum],
              [bn ? 'ভাষা' : 'Language', book.language || 'bn'],
              [bn ? 'সংস্করণ' : 'Edition', book.edition || (bn ? 'প্রযোজ্য নয়' : 'N/A')],
              [bn ? 'প্রকাশক' : 'Publisher', book.publisher || (bn ? 'প্রযোজ্য নয়' : 'N/A')],
            ].map(([k, v]) => (
              <div key={k} className="key-cell"><span>{k}</span><strong>{v}</strong></div>
            ))}
          </div>
          <button
            className="pg-btn-candy"
            style={{ marginTop: 14 }}
            onClick={() => {
              setBookId(book._id);
              if (book.subject) setSubject(book.subject);
              navigate('/tutor');
            }}
          >
            {bn ? 'এই বই থেকে জিজ্ঞেস করো' : 'Ask from this book'}
          </button>
        </div>

        <div className="pg-card" style={{ padding: 20, marginTop: 16 }}>
          <h2 style={{ fontSize: 19 }}>{bn ? 'বইয়ের ভেতরে (নমুনা)' : 'Inside this book (samples)'}</h2>
          {samples.length === 0 && <p className="muted">{bn ? 'এখনো নমুনা নেই।' : 'No samples yet.'}</p>}
          {samples.map((s) => (
            <div key={s.chunkId} className="sample-row">
              <div className="sample-head">{s.chapterTitle || (bn ? 'অংশ' : 'Part')}{s.pageStart ? `, Page ${s.pageStart}` : ''}</div>
              <p>{s.preview}</p>
            </div>
          ))}
        </div>

        {related.length > 0 && (
          <div style={{ marginTop: 18 }}>
            <h2 style={{ fontSize: 19 }}>{bn ? 'সম্পর্কিত বই' : 'Related books'}</h2>
            <div className="book-grid">
              {related.map((r) => (
                <article key={r._id} className="pg-card book-card hover-lift">
                  <div className="book-body">
                    <h3>{r.title}</h3>
                    <p className="muted small">{r.subject} • {r.grade}</p>
                    <Link to={`/books/${r._id}`} className="pg-btn-secondary book-btn">{bn ? 'বিস্তারিত দেখো' : 'View details'}</Link>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
