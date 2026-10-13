import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { MdArrowForward, MdCheck, MdMenuBook, MdStar, MdGroups, MdQuiz } from 'react-icons/md';
import { Mascot } from '@/components/landing/Mascot';
import { useLang } from '@/lib/i18n';

export function LandingPage() {
  const navigate = useNavigate();
  const { t, tbadges, lang } = useLang();
  const bn = lang === 'bn';
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');

  const subscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setEmailError(bn ? 'সঠিক ইমেইল লেখো।' : 'Please enter a valid email.');
      return;
    }
    setEmailError('');
    try {
      const k = 'sb_newsletter';
      const raw = localStorage.getItem(k);
      const list: string[] = raw ? JSON.parse(raw) : [];
      if (!list.includes(email.trim())) list.push(email.trim());
      localStorage.setItem(k, JSON.stringify(list));
    } catch { /* ignore */ }
    toast.success(bn ? 'ধন্যবাদ। নতুন পাঠ এলে জানাবো।' : 'Thanks. We will share new lessons.');
    setEmail('');
  };

  const steps = bn ? [
    { n: '১', t: 'Unit, Lesson, Page লেখো', d: 'যেমন: Unit 3, Lesson 5, Page 45' },
    { n: '২', t: 'Activity যোগ করো', d: 'যেমন: Match the requests' },
    { n: '৩', t: 'সহজ বাংলায় শেখো', d: 'অর্থ, উদাহরণ আর ১টি অনুশীলন' },
  ] : [
    { n: '1', t: 'Write Unit, Lesson, Page', d: 'Example: Unit 3, Lesson 5, Page 45' },
    { n: '2', t: 'Add the Activity', d: 'Example: Match the requests' },
    { n: '3', t: 'Learn in easy Bangla', d: 'Meaning, example and 1 practice' },
  ];

  const features = bn ? [
    { icon: MdMenuBook, c: '#8B5CF6', t: 'Unit Lesson Page বোঝে', d: 'ছোট লেখা দিলেই exact অংশ খুঁজে সমাধান দেয়।' },
    { icon: MdQuiz, c: '#0D9488', t: 'তৃতীয় শ্রেণির সহজ ভাষা', d: 'ছোট বাক্য, বাংলা অর্থ, শেষে ১টি প্রশ্ন।' },
    { icon: MdStar, c: '#D97706', t: 'মিল খেলা আছে', d: 'Request এ ট্যাপ, reply তে ট্যাপ, তারা জেতো।' },
    { icon: MdGroups, c: '#7C3AED', t: 'নিরাপদ ও বইভিত্তিক', d: 'English For Today এর কাছাকাছি, ভুলে উৎসাহ।' },
  ] : [
    { icon: MdMenuBook, c: '#8B5CF6', t: 'Understands Unit Lesson Page', d: 'Short text finds the exact match and solves it.' },
    { icon: MdQuiz, c: '#0D9488', t: 'Simple Class 3 words', d: 'Short sentences, Bangla meaning, 1 practice at end.' },
    { icon: MdStar, c: '#D97706', t: 'Matching game included', d: 'Tap a request, tap a reply, earn stars.' },
    { icon: MdGroups, c: '#7C3AED', t: 'Safe and book based', d: 'Close to English For Today, kind on mistakes.' },
  ];

  const subjects = bn ? [
    { e: 'Aa', t: 'English', d: 'Request, reply, matching', c: '#8B5CF6' },
    { e: 'অ', t: 'বাংলা', d: 'বাক্য, শব্দ, পড়া', c: '#0D9488' },
    { e: '১২', t: 'গণিত', d: 'যোগ, ভগ্নাংশ, ডজন', c: '#D97706' },
    { e: '❀', t: 'বিজ্ঞান', d: 'গাছ, খাবার, পরিবেশ', c: '#16A34A' },
  ] : [
    { e: 'Aa', t: 'English', d: 'Requests, replies, matching', c: '#8B5CF6' },
    { e: 'অ', t: 'Bangla', d: 'Sentences, words, reading', c: '#0D9488' },
    { e: '12', t: 'Math', d: 'Add, fractions, dozen', c: '#D97706' },
    { e: '❀', t: 'Science', d: 'Plants, food, nature', c: '#16A34A' },
  ];

  const stats = bn ? [
    { n: '3', l: 'শ্রেণি' }, { n: '4+', l: 'বিষয়' }, { n: '5', l: 'মিল সমাধান' }, { n: '24/7', l: 'পড়ার বন্ধু' },
  ] : [
    { n: '3', l: 'Class' }, { n: '4+', l: 'Subjects' }, { n: '5', l: 'Matches solved' }, { n: '24/7', l: 'Study buddy' },
  ];

  const quotes = bn ? [
    { q: 'আমার মেয়ে এখন নিজে Unit আর Page লিখে প্রশ্ন করে। ভুল হলেও ভয় পায় না।', w: 'অভিভাবক, ঢাকা' },
    { q: 'মিল খেলাটা ক্লাসের পড়াকে খেলায় বদলে দিয়েছে। বাচ্চারা তারা পেতে ভালোবাসে।', w: 'শিক্ষক, চট্টগ্রাম' },
    { q: 'Banglish লিখলেও বাংলায় পরিষ্কার উত্তর আসে। বাড়ির কাজ অনেক সহজ হয়েছে।', w: 'অভিভাবক, রাজশাহী' },
  ] : [
    { q: 'My daughter now writes Unit and Page herself. She is not afraid of mistakes.', w: 'Parent, Dhaka' },
    { q: 'The matching game turned classwork into play. Kids love earning stars.', w: 'Teacher, Chattogram' },
    { q: 'Even in Banglish, clear Bangla answers come back. Homework got easier.', w: 'Parent, Rajshahi' },
  ];

  const faqs = bn ? [
    { q: 'লগইন ছাড়া কি ব্যবহার করা যায়?', a: 'হ্যাঁ। অতিথি হিসেবে টেক্সট প্রশ্ন করা যায়। ছবি, ভয়েস আর সংরক্ষণের জন্য লগইন করো।' },
    { q: 'উত্তর কি বই থেকে আসে?', a: 'হ্যাঁ। বইয়ের অংশ খুঁজে উত্তর দেয়। না পেলে সৎভাবে জানিয়ে দেয়।' },
    { q: 'মোবাইলে কি ভালো চলে?', a: 'হ্যাঁ। মোবাইল, ট্যাব আর ডেস্কটপ সব পর্দায় মানিয়ে চলে।' },
  ] : [
    { q: 'Can I use without login?', a: 'Yes. Guests can ask text questions. Login unlocks photos, voice and history.' },
    { q: 'Do answers come from books?', a: 'Yes. It finds the book section. When missing, it says so honestly.' },
    { q: 'Does it work on mobile?', a: 'Yes. It adapts to mobile, tablet and desktop screens.' },
  ];

  return (
    <div className="pg-app">
      {/* 1. Hero, capped at 65vh */}
      <section className="landing-hero" aria-labelledby="landing-hero-title">
        <div className="pg-dot-grid hero-decor" aria-hidden="true" />
        <div className="pg-container hero-grid">
          <div>
            <span className="pg-badge pg-badge-yellow">{t('hero.badge')}</span>
            <h1 id="landing-hero-title">
              {t('hero.titleA')} <span className="hero-hl">{t('hero.titleB')}</span> {t('hero.titleC')}
            </h1>
            <p className="hero-sub">{t('hero.sub')}</p>
            <div className="hero-cta">
              <button className="pg-btn-candy" onClick={() => navigate('/tutor')}>
                <span className="cta-dot"><MdArrowForward size={17} /></span>
                {t('action.startLearning')}
              </button>
              <button className="pg-btn-secondary" onClick={() => navigate('/exercise/match-requests')}>
                {t('action.playGame')}
              </button>
            </div>
            <ul className="hero-badges">
              {tbadges().map((b, i) => (
                <li key={b} className={i % 2 === 0 ? 'pg-badge pg-badge-mint' : 'pg-badge pg-badge-pink'}><MdCheck size={13} /> {b}</li>
              ))}
            </ul>
          </div>
          <div className="pg-card pg-card-pink-shadow pg-pop-in hero-card">
            <div className="hero-card-top">
              <Mascot size={64} mood="cheer" />
              <div><strong>{t('action.tryNow')}</strong><p>{bn ? 'Unit 3, Lesson 5, Page 45' : 'Unit 3, Lesson 5, Page 45'}</p></div>
            </div>
            <div className="pg-result-bubble"><span className="pg-result-icon">1</span><div style={{ fontWeight: 700 }}>Unit 3, Lesson 5, Page 45, Match the requests</div></div>
            <div className="pg-result-bubble correct"><span className="pg-result-icon">OK</span><div>{bn ? '৫টি মিল বাংলাসহ সমাধান। ছবি লাগে না।' : 'All 5 matches solved with Bangla meaning. No photo needed.'}</div></div>
            <button className="pg-btn-candy full" onClick={() => navigate('/tutor')}>{t('action.askTutor')}</button>
          </div>
        </div>
      </section>

      {/* 2. How it works */}
      <section className="pg-container section" aria-label={bn ? 'কীভাবে কাজ করে' : 'How it works'}>
        <h2 className="section-title">{bn ? '৩ ধাপে জিজ্ঞেস করো' : 'Ask in 3 steps'}</h2>
        <div className="card-3">
          {steps.map((s) => (
            <div key={s.n} className="pg-card hover-lift step-card">
              <span className="step-n">{s.n}</span>
              <h3>{s.t}</h3>
              <p>{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Features */}
      <section className="pg-container section" aria-labelledby="feat-t">
        <h2 id="feat-t" className="section-title">{bn ? 'ছোটদের জন্য তৈরি' : 'Made for little learners'}</h2>
        <p className="section-sub">{bn ? 'তৃতীয় শ্রেণির বাড়ির কাজ হাসিমুখে শেষ করার সবকিছু।' : 'Everything a Class 3 child needs to finish homework with a smile.'}</p>
        <div className="card-4">
          {features.map((f) => (
            <article key={f.t} className="pg-card hover-lift feat-card">
              <div className="pg-icon-circle" style={{ background: f.c }}><f.icon /></div>
              <h3>{f.t}</h3>
              <p>{f.d}</p>
            </article>
          ))}
        </div>
      </section>

      {/* 4. Subjects */}
      <section className="pg-container section" aria-label={bn ? 'বিষয়' : 'Subjects'}>
        <h2 className="section-title">{bn ? 'বিষয় বেছে নাও' : 'Pick a subject'}</h2>
        <div className="card-4">
          {subjects.map((s) => (
            <button key={s.t} className="pg-card hover-lift subj-card" onClick={() => navigate('/tutor')}>
              <span className="subj-e" style={{ background: s.c }}>{s.e}</span>
              <strong>{s.t}</strong>
              <span className="muted">{s.d}</span>
            </button>
          ))}
        </div>
      </section>

      {/* 5. Live preview CTA */}
      <section className="pg-container section" aria-label="Preview">
        <div className="preview-grid">
          <div className="pg-card pg-card-yellow-shadow preview-card">
            <strong>{bn ? 'একজন শিশু জিজ্ঞেস করে' : 'A child asks'}</strong>
            <div className="pg-result-bubble"><span className="pg-result-icon">You</span><div style={{ fontWeight: 700 }}>Unit 3, Lesson 5, Activity C, Match the requests, Page 45.</div></div>
            <div className="pg-result-bubble correct"><span className="pg-result-icon">OK</span><div>{bn ? 'শিখি বন্ধু ৫টি মিল একসাথে বাংলাসহ সমাধান করে।' : 'Shikhi Bondhu solves all 5 matches at once, with Bangla meaning.'}</div></div>
          </div>
          <div className="pg-card preview-card preview-cta">
            <Mascot size={56} />
            <strong>{bn ? 'শিখি বন্ধু অনলাইন' : 'Shikhi Bondhu is online'}</strong>
            <p className="muted">{bn ? 'ছোট লেখাই যথেষ্ট। নিচে ট্যাপ করে আসল খেলা খেলো।' : 'Short text is enough. Tap below to play the real game.'}</p>
            <button className="pg-btn-candy full" onClick={() => navigate('/exercise/match-requests')}>{bn ? 'মিল খেলা খোলো' : 'Open matching game'}</button>
          </div>
        </div>
      </section>

      {/* 6. Stats */}
      <section className="pg-container section" aria-label="Stats">
        <div className="pg-card stats-card">
          {stats.map((s) => (
            <div key={s.l} className="stat"><span className="stat-n">{s.n}</span><span className="stat-l">{s.l}</span></div>
          ))}
        </div>
      </section>

      {/* 7. Testimonials */}
      <section className="pg-container section" aria-label={bn ? 'অভিভাবকরা যা বলেন' : 'What families say'}>
        <h2 className="section-title">{bn ? 'পরিবার যা বলে' : 'Loved by families'}</h2>
        <div className="card-3">
          {quotes.map((q) => (
            <figure key={q.q.slice(0, 18)} className="pg-card hover-lift quote-card">
              <div className="stars" aria-hidden="true">★★★★★</div>
              <blockquote>{q.q}</blockquote>
              <figcaption>{q.w}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* 8. FAQ */}
      <section className="pg-container section" aria-label="FAQ">
        <h2 className="section-title">FAQ</h2>
        <div className="faq-list">
          {faqs.map((f) => (
            <div key={f.q} className="pg-card faq"><strong>{f.q}</strong><p>{f.a}</p></div>
          ))}
        </div>
      </section>

      {/* 9. Newsletter + final CTA */}
      <section className="pg-container section" aria-labelledby="cta-t" style={{ paddingBottom: 72 }}>
        <div className="pg-card pg-card-mint-shadow cta-card">
          <Mascot size={60} mood="happy" />
          <h2 id="cta-t">{bn ? 'আজ কী শিখবে' : 'What will you learn today'}</h2>
          <p className="muted">{bn ? 'লগইন ছাড়া চেষ্টা করো, অথবা অ্যাকাউন্ট করে তারা সংরক্ষণ করো।' : 'Try without login, or make an account to save stars and progress.'}</p>
          <form className="newsletter" onSubmit={subscribe} noValidate>
            <label htmlFor="nl-email" className="sr-only">{bn ? 'ইমেইল' : 'Email'}</label>
            <input id="nl-email" className="pg-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={bn ? 'নতুন পাঠের জন্য ইমেইল লেখো' : 'Email for new lessons'} aria-label={bn ? 'ইমেইল' : 'Email'} />
            <button className="pg-btn-secondary" type="submit">{bn ? 'যুক্ত হও' : 'Notify me'}</button>
          </form>
          {emailError && <p className="form-error" role="alert">{emailError}</p>}
          <div className="hero-cta center">
            <button className="pg-btn-candy" onClick={() => navigate('/tutor')}>{t('action.startLearning')}</button>
            <button className="pg-btn-secondary" onClick={() => navigate('/books')}>{t('action.seeBooks')}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
