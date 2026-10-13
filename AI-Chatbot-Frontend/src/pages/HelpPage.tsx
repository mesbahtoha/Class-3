import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLang } from '@/lib/i18n';

export function HelpPage() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [open, setOpen] = useState<number | null>(0);
  const faqs = bn ? [
    { q: 'কীভাবে প্রশ্ন করবো?', a: 'Unit, Lesson, Page আর Activity এক লাইনে লেখো। যেমন: Unit 3, Lesson 5, Page 45, Match the requests।' },
    { q: 'Banglish এ লিখলে হবে?', a: 'হ্যাঁ। তুমি Banglish এ লিখলেও উত্তর সহজ বাংলায় আসবে।' },
    { q: 'ছবি কি দিতে হবে?', a: 'না। ছোট লেখাই যথেষ্ট। লগইন করলে ছবি আর ভয়েস সুবিধা পাবে।' },
    { q: 'বইয়ে উত্তর না থাকলে কী হয়?', a: 'সৎভাবে জানিয়ে দেবে যে এটি বইয়ে পাওয়া যায়নি, সাথে সাধারণ সাহায্য দেবে।' },
    { q: 'লগইন করতে সমস্যা হলে?', a: 'ইমেইল ঠিক আছে কিনা দেখো, পাসওয়ার্ড কমপক্ষে ৮ অক্ষর হতে হবে। তবুও না হলে যোগাযোগ পাতায় লেখো।' },
  ] : [
    { q: 'How do I ask?', a: 'Write Unit, Lesson, Page and Activity in one line. Example: Unit 3, Lesson 5, Page 45, Match the requests.' },
    { q: 'Can I write in Banglish?', a: 'Yes. You can write in Banglish and the answer still comes in easy Bangla.' },
    { q: 'Do I need a photo?', a: 'No. Short text is enough. Login unlocks photos, voice and saved history.' },
    { q: 'What if the book has no answer?', a: 'It says honestly that it was not found in the book, with general help.' },
    { q: 'Login trouble?', a: 'Check your email, password must be 8+ characters. Still stuck, write on the Contact page.' },
  ];
  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 760, paddingTop: 32 }}>
        <span className="pg-badge pg-badge-pink" style={{ marginBottom: 12, display: 'inline-flex' }}>{bn ? 'সাহায্য' : 'Help'}</span>
        <h1 style={{ fontSize: 30 }}>{bn ? 'সাহায্য কেন্দ্র' : 'Help center'}</h1>
        <p style={{ color: '#64748B' }}>{bn ? 'দ্রুত উত্তর পেতে নিচের প্রশ্নগুলো দেখো।' : 'Find quick answers below.'}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 16 }}>
          {faqs.map((f, i) => (
            <div key={f.q} className="pg-card" style={{ padding: 0, overflow: 'hidden' }}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
                style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '16px 18px', fontWeight: 800, fontSize: 15, cursor: 'pointer', color: 'inherit' }}
              >
                {i + 1}. {f.q}
              </button>
              {open === i && <p style={{ padding: '0 18px 16px', margin: 0, color: '#475569' }}>{f.a}</p>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <Link to="/tutor" className="pg-btn-candy">{bn ? 'পড়া শুরু করো' : 'Start learning'}</Link>
          <Link to="/contact" className="pg-btn-secondary">{bn ? 'যোগাযোগ করো' : 'Contact us'}</Link>
        </div>
      </div>
    </div>
  );
}
