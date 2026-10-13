import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listBooks } from '@/lib/tutor';
import { Mascot } from '@/components/landing/Mascot';
import { useLang } from '@/lib/i18n';
import type { BookInfo } from '@/types';

const PAGE_SIZE = 9;
const SUBJECT_COLORS: Record<string, string> = { English: '#8B5CF6', Bangla: '#0D9488', Math: '#D97706', Science: '#16A34A' };

function SkeletonCards() {
  return (
    <div className="book-grid" aria-hidden="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="pg-card book-card">
          <div className="skeleton skeleton-cover" />
          <div className="skeleton skeleton-title" />
          <div className="skeleton skeleton-text" />
          <div className="skeleton skeleton-text short" />
        </div>
      ))}
    </div>
  );
}

export function BooksPage() {
  const { lang, t } = useLang();
  const bn = lang === 'bn';
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [subject, setSubject] = useState('');
  const [curriculum, setCurriculum] = useState('');
  const [sort, setSort] = useState<'title' | 'subject' | 'recent'>('title');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => { setDebounced(search.trim()); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    listBooks({ search: debounced || undefined })
      .then(setBooks)
      .catch(() => setBooks([]))
      .finally(() => setLoading(false));
  }, [debounced]);

  const subjects = useMemo(() => Array.from(new Set(books.map((b) => b.subject).filter(Boolean))), [books]);
  const curricula = useMemo(() => Array.from(new Set(books.map((b) => b.curriculum).filter(Boolean))), [books]);

  const filtered = useMemo(() => {
    let out = [...books];
    if (subject) out = out.filter((b) => b.subject === subject);
    if (curriculum) out = out.filter((b) => b.curriculum === curriculum);
    if (sort === 'title') out.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === 'subject') out.sort((a, b) => `${a.subject} ${a.title}`.localeCompare(`${b.subject} ${b.title}`));
    if (sort === 'recent') out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return out;
  }, [books, subject, curriculum, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 1020, paddingTop: 28 }}>
        <span className="pg-badge pg-badge-yellow" style={{ marginBottom: 10, display: 'inline-flex' }}>{bn ? 'তৃতীয় শ্রেণির লাইব্রেরি' : 'Class 3 library'}</span>
        <h1 style={{ fontSize: 32, marginBottom: 6 }}>{bn ? 'বইয়ের তালিকা' : 'Book list'}</h1>
        <p className="muted" style={{ marginBottom: 16 }}>{bn ? 'প্রকাশিত বই এখানে থাকে। নতুন বই তৈরি হলেই আসে।' : 'Published Class 3 books live here. New books appear as soon as they are ready.'}</p>

        <div className="pg-card toolbar-card">
          <div className="toolbar-row">
            <label className="sr-only" htmlFor="bk-search">{t('action.search')}</label>
            <input id="bk-search" className="pg-input toolbar-search" placeholder={bn ? 'বই বা বিষয় খোঁজো...' : 'Search a book or subject...'} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={bn ? 'বই খোঁজো' : 'Search books'} />
            <label className="toolbar-field">{bn ? 'বিষয়' : 'Subject'}
              <select className="pg-input" value={subject} onChange={(e) => { setSubject(e.target.value); setPage(1); }} aria-label={bn ? 'বিষয়' : 'Subject'}>
                <option value="">{bn ? 'সব' : 'All'}</option>
                {subjects.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="toolbar-field">{bn ? 'কারিকুলাম' : 'Curriculum'}
              <select className="pg-input" value={curriculum} onChange={(e) => { setCurriculum(e.target.value); setPage(1); }} aria-label="Curriculum">
                <option value="">{bn ? 'সব' : 'All'}</option>
                {curricula.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="toolbar-field">{bn ? 'সাজাও' : 'Sort'}
              <select className="pg-input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
                <option value="title">{bn ? 'নাম' : 'Title'}</option>
                <option value="subject">{bn ? 'বিষয়' : 'Subject'}</option>
                <option value="recent">{bn ? 'নতুন' : 'Recent'}</option>
              </select>
            </label>
          </div>
          <p className="muted small">{filtered.length} {bn ? 'টি বই' : 'books'} • {bn ? 'পাতা' : 'Page'} {current}/{pages}</p>
        </div>

        {loading && <SkeletonCards />}
        {!loading && filtered.length === 0 && (
          <div className="pg-card empty-card">
            <Mascot size={64} mood="thinking" />
            <p className="muted">{bn ? 'এখনো প্রকাশিত বই নেই। তবুও শিখি বন্ধুকে জিজ্ঞেস করতে পারো।' : 'No published book yet. You can still ask Shikhi Bondhu.'}</p>
            <Link to="/tutor" className="pg-btn-secondary">{bn ? 'তবুও জিজ্ঞেস করো' : 'Ask anyway'}</Link>
          </div>
        )}
        {!loading && visible.length > 0 && (
          <div className="book-grid">
            {visible.map((b) => (
              <article key={b._id} className="pg-card book-card hover-lift">
                <div className="book-cover" style={{ background: SUBJECT_COLORS[b.subject] || '#8B5CF6' }}>
                  <span aria-hidden="true">📚</span>
                  <span className="book-subject">{b.subject}</span>
                </div>
                <div className="book-body">
                  <h3>{b.title}</h3>
                  <p className="muted small book-desc">{b.grade} • {b.curriculum}{b.edition ? ` • ${b.edition}` : ''}</p>
                  <p className="muted small book-meta">{b.language || (bn ? 'বাংলা/ইংরেজি' : 'bn/en')}{typeof b.chunkCount === 'number' ? ` • ${b.chunkCount} sections` : ''}</p>
                  <Link to={`/books/${b._id}`} className="pg-btn-secondary book-btn">{t('action.viewDetails')}</Link>
                </div>
              </article>
            ))}
          </div>
        )}

        {pages > 1 && (
          <nav className="pagination" aria-label="Pagination">
            <button className="pg-btn-secondary pg-page" disabled={current <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>←</button>
            {Array.from({ length: pages }).map((_, i) => (
              <button key={i} className={i + 1 === current ? 'pg-btn-candy pg-page' : 'pg-btn-secondary pg-page'} onClick={() => setPage(i + 1)} aria-current={i + 1 === current ? 'page' : undefined}>{i + 1}</button>
            ))}
            <button className="pg-btn-secondary pg-page" disabled={current >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>→</button>
          </nav>
        )}
      </div>
    </div>
  );
}
