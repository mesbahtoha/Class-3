import { useLang } from '@/lib/i18n';

export function PrivacyPage() {
  const { lang } = useLang();
  const bn = lang === 'bn';
  return (
    <div className="pg-app" style={{ paddingBottom: 72 }}>
      <div className="pg-container" style={{ maxWidth: 760, paddingTop: 32 }}>
        <span className="pg-badge pg-badge-mint" style={{ marginBottom: 12, display: 'inline-flex' }}>{bn ? 'গোপনীয়তা' : 'Privacy'}</span>
        <h1 style={{ fontSize: 30 }}>{bn ? 'গোপনীয়তা ও শর্ত' : 'Privacy and terms'}</h1>
        <div className="pg-card" style={{ padding: 24, marginTop: 14 }}>
          {(bn ? [
            ['আমরা কী রাখি', 'নাম, ইমেইল, চ্যাট ইতিহাস আর ব্যবহার পরিমাণ। পড়ার উন্নতির জন্যই শুধু ব্যবহার হয়।'],
            ['আমরা কী রাখি না', 'অপ্রয়োজনীয় ছবি স্থায়ীভাবে রাখি না। অতিথিদের ইতিহাস সংরক্ষণ করি না।'],
            ['শিশুদের নিরাপত্তা', 'ভুল উত্তরে বকা নয়। ক্ষতিকর বা বইয়ের বাইরের বিষয়ে সতর্ক বার্তা দেওয়া হয়।'],
            ['তোমার নিয়ন্ত্রণ', 'তুমি চ্যাট মুছতে পারো। অ্যাকাউন্ট বন্ধ করতে চাইলে যোগাযোগ পাতায় লেখো।'],
            ['যোগাযোগ', 'প্রশ্ন থাকলে hello@shikhibondhu.app এ লেখো।'],
          ] : [
            ['What we keep', 'Name, email, chat history and usage counts. Used only to improve learning.'],
            ['What we do not keep', 'We do not persist guest history. Uploaded files are memory only and expire.'],
            ['Child safety', 'No shame on mistakes. Harmful or off book topics get a caring guardrail.'],
            ['Your control', 'You can delete chats. To close your account, write on the Contact page.'],
            ['Contact', 'Questions, write to hello@shikhibondhu.app.'],
          ]).map(([h, p]) => (
            <section key={h} style={{ padding: '12px 0', borderTop: '2px solid #F1F5F9' }}>
              <h3 style={{ fontSize: 16, marginBottom: 4 }}>{h}</h3>
              <p style={{ margin: 0, color: '#475569' }}>{p}</p>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
