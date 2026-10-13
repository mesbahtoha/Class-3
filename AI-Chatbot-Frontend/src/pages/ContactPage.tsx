import { useState } from 'react';
import toast from 'react-hot-toast';
import { useLang } from '@/lib/i18n';

export function ContactPage() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState(bn ? 'সাধারণ' : 'General');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (name.trim().length < 2) { setError(bn ? 'তোমার নাম লেখো।' : 'Please write your name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError(bn ? 'সঠিক ইমেইল লেখো।' : 'Please write a valid email.'); return; }
    if (message.trim().length < 10) { setError(bn ? 'বার্তা কমপক্ষে ১০ অক্ষরের হতে হবে।' : 'Message must be at least 10 characters.'); return; }
    setSending(true);
    setTimeout(() => {
      setSending(false); setSent(true);
      toast.success(bn ? 'বার্তা পৌঁছেছে। ধন্যবাদ।' : 'Message received. Thank you.');
    }, 700);
  };

  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 860, paddingTop: 32 }}>
        <span className="pg-badge pg-badge-mint" style={{ marginBottom: 12, display: 'inline-flex' }}>{bn ? 'যোগাযোগ' : 'Contact'}</span>
        <h1 style={{ fontSize: 30 }}>{bn ? 'আমাদের লেখো' : 'Write to us'}</h1>
        <p style={{ color: '#64748B' }}>{bn ? 'পড়া, বই বা সমস্যা নিয়ে জানাও। আমরা সাধারণত ২ কর্মদিবসে উত্তর দিই।' : 'Tell us about lessons, books or issues. We usually reply within 2 working days.'}</p>
        <div className="contact-grid">
          <form className="pg-card" style={{ padding: 22 }} onSubmit={submit} noValidate>
            <label className="pg-field" htmlFor="ct-name"><span>{bn ? 'নাম' : 'Name'}</span>
              <input id="ct-name" className="pg-input" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} autoComplete="name" placeholder={bn ? 'তোমার নাম' : 'Your name'} />
            </label>
            <label className="pg-field" htmlFor="ct-email"><span>{bn ? 'ইমেইল' : 'Email'}</span>
              <input id="ct-email" className="pg-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" />
            </label>
            <label className="pg-field" htmlFor="ct-topic"><span>{bn ? 'বিষয়' : 'Topic'}</span>
              <select id="ct-topic" className="pg-input" value={topic} onChange={(e) => setTopic(e.target.value)}>
                <option>{bn ? 'সাধারণ' : 'General'}</option>
                <option>{bn ? 'বই' : 'Books'}</option>
                <option>{bn ? 'পড়া' : 'Lessons'}</option>
                <option>{bn ? 'সমস্যা' : 'Issue'}</option>
              </select>
            </label>
            <label className="pg-field" htmlFor="ct-msg"><span>{bn ? 'বার্তা' : 'Message'}</span>
              <textarea id="ct-msg" className="pg-input" rows={5} value={message} onChange={(e) => setMessage(e.target.value)} required minLength={10} placeholder={bn ? 'তোমার কথা লেখো...' : 'Write your message...'} />
            </label>
            {error && <p className="form-error" role="alert">{error}</p>}
            {sent && <p className="form-ok" role="status">{bn ? 'পাঠানো হয়েছে। শিগগিরই উত্তর দেবো।' : 'Sent. We will reply soon.'}</p>}
            <button className="pg-btn-candy" type="submit" disabled={sending}>{sending ? (bn ? 'পাঠানো হচ্ছে...' : 'Sending...') : (bn ? 'পাঠাও' : 'Send')}</button>
          </form>
          <div className="pg-card pg-card-yellow-shadow" style={{ padding: 22 }}>
            <h3 style={{ fontSize: 17 }}>{bn ? 'সরাসরি যোগাযোগ' : 'Direct contact'}</h3>
            <p style={{ color: '#475569', fontSize: 14.5 }}>hello@shikhibondhu.app<br />Dhaka, Bangladesh</p>
            <div className="pg-card" style={{ padding: 14, background: '#FFFBEB' }}>
              <strong>{bn ? 'ছোটদের জন্য টিপস' : 'Tip for kids'}</strong>
              <p style={{ margin: '6px 0 0', fontSize: 14, color: '#475569' }}>
                {bn ? 'Unit, Lesson, Page আর Activity একসাথে লিখলে দ্রুত সঠিক উত্তর পাবে।' : 'Write Unit, Lesson, Page and Activity together for the fastest correct answer.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
