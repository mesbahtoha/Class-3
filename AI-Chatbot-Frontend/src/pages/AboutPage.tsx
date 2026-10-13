import { Link } from 'react-router-dom';
import { Mascot } from '@/components/landing/Mascot';
import { useLang } from '@/lib/i18n';

export function AboutPage() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 860, paddingTop: 32 }}>
        <span className="pg-badge pg-badge-yellow" style={{ marginBottom: 12, display: 'inline-flex' }}>{bn ? 'আমাদের সম্পর্কে' : 'About us'}</span>
        <div className="pg-card pg-card-yellow-shadow pg-pop-in" style={{ padding: 28, display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <Mascot size={88} />
          <div style={{ flex: '1 1 260px' }}>
            <h1 style={{ fontSize: 30, marginBottom: 8 }}>{bn ? 'শিখি বন্ধু কী করে' : 'What Shikhi Bondhu does'}</h1>
            <p style={{ color: '#475569', margin: 0 }}>
              {bn
                ? 'শিখি বন্ধু তৃতীয় শ্রেণির English For Today বইভিত্তিক পড়ার বন্ধু। Unit, Lesson আর Page নম্বর দিলে বইয়ের অংশ খুঁজে সহজ বাংলায় বুঝিয়ে দেয়। ছবি দরকার নেই, ছোট লেখাই যথেষ্ট।'
                : 'Shikhi Bondhu is a Class 3 study friend built around English For Today. Give Unit, Lesson and Page number and it finds the book section and explains in easy Bangla. Short text is enough, no photo needed.'}
            </p>
          </div>
        </div>

        <div className="info-grid">
          {[
            { t: bn ? 'বইভিত্তিক উত্তর' : 'Book based answers', d: bn ? 'উত্তর বইয়ের অংশ থেকে আসে। বইয়ে না থাকলে সৎভাবে জানিয়ে দেয়।' : 'Answers come from book sections. When missing, it says so honestly.' },
            { t: bn ? 'ছোটদের ভাষা' : 'Kid friendly words', d: bn ? 'ছোট বাক্য, বাংলা অর্থ, শেষে একটি ছোট অনুশীলন প্রশ্ন।' : 'Short sentences, Bangla meaning, one small practice question at the end.' },
            { t: bn ? 'নিরাপদ' : 'Safe', d: bn ? 'ভুল উত্তরে বকা নয়। উৎসাহ দিয়ে আবার শেখায়।' : 'No shame on wrong tries. It encourages and reteaches.' },
            { t: bn ? 'শিক্ষক ও অভিভাবক' : 'Teachers and parents', d: bn ? 'বই প্রকাশ, AI সেটিংস আর ব্যবহার দেখার জন্য অ্যাডমিন প্যানেল আছে।' : 'Admin panel for book publishing, AI settings and usage review.' },
          ].map((c) => (
            <article key={c.t} className="pg-card hover-lift" style={{ padding: 20 }}>
              <h3 style={{ fontSize: 16, marginBottom: 6 }}>{c.t}</h3>
              <p style={{ margin: 0, color: '#475569', fontSize: 14.5 }}>{c.d}</p>
            </article>
          ))}
        </div>

        <div className="pg-card pg-card-mint-shadow" style={{ padding: 24, marginTop: 18, textAlign: 'center' }}>
          <h2 style={{ fontSize: 22 }}>{bn ? 'আজ কী শিখবে' : 'What will you learn today'}</h2>
          <p style={{ color: '#64748B' }}>{bn ? 'লগইন ছাড়া চেষ্টা করো, অথবা অ্যাকাউন্ট করে তারা আর অগ্রগতি সংরক্ষণ করো।' : 'Try without login, or make an account to save stars and progress.'}</p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/tutor" className="pg-btn-candy">{bn ? 'পড়া শুরু করো' : 'Start learning'}</Link>
            <Link to="/books" className="pg-btn-secondary">{bn ? 'বই দেখো' : 'See books'}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
