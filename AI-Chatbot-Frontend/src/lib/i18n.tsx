import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Lang = 'en' | 'bn';

const KEY = 'sb_lang';

const dict = {
  en: {
    'nav.home': 'Home',
    'nav.tutor': 'Tutor',
    'nav.practice': 'Practice',
    'nav.books': 'Books',
    'nav.game': 'Matching Game',
    'nav.about': 'About',
    'nav.contact': 'Contact',
    'nav.help': 'Help',
    'nav.privacy': 'Privacy',
    'nav.login': 'Login',
    'nav.register': 'Create account',
    'nav.dashboard': 'Dashboard',
    'nav.chat': 'My Chat',
    'nav.profile': 'Profile',
    'nav.logout': 'Logout',
    'nav.openApp': 'Open app',
    'nav.getStarted': 'Get started',
    'nav.menu': 'Menu',
    'nav.close': 'Close',
    'action.startLearning': 'Start learning',
    'action.seeBooks': 'See books',
    'action.playGame': 'Play matching game',
    'action.askTutor': 'Ask Shikhi Bondhu',
    'action.tryNow': 'Try this now',
    'action.backTutor': 'Back to tutor',
    'action.viewDetails': 'View details',
    'action.send': 'Send',
    'action.search': 'Search',
    'action.allBooks': 'All books',
    'action.save': 'Save',
    'common.loading': 'Loading...',
    'common.noResults': 'Nothing found yet.',
    'hero.badge': 'Shikhi Bondhu, Class 3 English Friend',
    'hero.titleA': 'Learn from your book,',
    'hero.titleB': 'with joy',
    'hero.titleC': 'in easy Bangla',
    'hero.sub': 'Your Class 3 study friend for English For Today. Ask with Unit, Lesson and Page number, get matching answers in simple words.',
    'hero.badges': ['Class 3 book based', 'Understands Bangla and Banglish', 'Teaches in easy steps', 'Safe and caring'],
    'footer.tag': 'Shikhi Bondhu, Class 3 English Friend, made with care for young learners.',
    'footer.explore': 'Explore',
    'footer.support': 'Support',
    'footer.contact': 'Contact',
    'footer.rights': 'All rights reserved.',
    'footer.made': 'Made for Class 3 learners in Bangladesh.',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'lang.label': 'Language',
  },
  bn: {
    'nav.home': 'হোম',
    'nav.tutor': 'শিক্ষক',
    'nav.practice': 'অনুশীলন',
    'nav.books': 'বই',
    'nav.game': 'মিল খেলা',
    'nav.about': 'আমাদের সম্পর্কে',
    'nav.contact': 'যোগাযোগ',
    'nav.help': 'সাহায্য',
    'nav.privacy': 'গোপনীয়তা',
    'nav.login': 'লগইন',
    'nav.register': 'অ্যাকাউন্ট খোলো',
    'nav.dashboard': 'ড্যাশবোর্ড',
    'nav.chat': 'আমার চ্যাট',
    'nav.profile': 'প্রোফাইল',
    'nav.logout': 'লগআউট',
    'nav.openApp': 'অ্যাপ খোলো',
    'nav.getStarted': 'শুরু করো',
    'nav.menu': 'মেনু',
    'nav.close': 'বন্ধ করো',
    'action.startLearning': 'পড়া শুরু করো',
    'action.seeBooks': 'বই দেখো',
    'action.playGame': 'মিল খেলা খেলো',
    'action.askTutor': 'শিখি বন্ধুকে জিজ্ঞেস করো',
    'action.tryNow': 'এখনই চেষ্টা করো',
    'action.backTutor': 'শিক্ষকের কাছে ফিরে যাও',
    'action.viewDetails': 'বিস্তারিত দেখো',
    'action.send': 'পাঠাও',
    'action.search': 'খোঁজো',
    'action.allBooks': 'সব বই',
    'action.save': 'সংরক্ষণ করো',
    'common.loading': 'লোড হচ্ছে...',
    'common.noResults': 'এখনো কিছু পাওয়া যায়নি।',
    'hero.badge': 'শিখি বন্ধু, তৃতীয় শ্রেণির ইংরেজি বন্ধু',
    'hero.titleA': 'তোমার বই থেকে শেখো,',
    'hero.titleB': 'আনন্দে',
    'hero.titleC': 'সহজ বাংলায়',
    'hero.sub': 'English For Today বইয়ের তোমার তৃতীয় শ্রেণির পড়ার বন্ধু। Unit, Lesson আর Page নম্বর লিখে জিজ্ঞেস করো, সহজ ভাষায় উত্তর পাও।',
    'hero.badges': ['তৃতীয় শ্রেণির বইভিত্তিক', 'বাংলা আর Banglish বোঝে', 'সহজ ধাপে শেখায়', 'নিরাপদ আর যত্নশীল'],
    'footer.tag': 'শিখি বন্ধু, তৃতীয় শ্রেণির ইংরেজি বন্ধু, ছোট শিক্ষার্থীদের জন্য যত্নে তৈরি।',
    'footer.explore': 'ঘুরে দেখো',
    'footer.support': 'সহায়তা',
    'footer.contact': 'যোগাযোগ',
    'footer.rights': 'সর্বস্বত্ব সংরক্ষিত।',
    'footer.made': 'বাংলাদেশের তৃতীয় শ্রেণির শিক্ষার্থীদের জন্য তৈরি।',
    'theme.light': 'আলো',
    'theme.dark': 'অন্ধকার',
    'lang.label': 'ভাষা',
  },
} as const;

export type DictKey = keyof (typeof dict)['en'];

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  toggleLang: () => void;
  t: (k: DictKey) => string;
  tbadges: () => string[];
}

const Ctx = createContext<LangCtx | null>(null);

export function getStoredLang(): Lang {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'bn' || v === 'en') return v;
  } catch { /* ignore */ }
  return 'en';
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => getStoredLang());
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem(KEY, l); } catch { /* ignore */ }
  }, []);
  const toggleLang = useCallback(() => {
    setLangState((p) => {
      const n = p === 'en' ? 'bn' : 'en';
      try { localStorage.setItem(KEY, n); } catch { /* ignore */ }
      return n;
    });
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute('lang', lang === 'bn' ? 'bn' : 'en');
  }, [lang]);
  const t = useCallback((k: DictKey): string => {
    const v = (dict[lang] as Record<string, unknown>)[k];
    if (typeof v === 'string') return v;
    return (dict.en as Record<string, unknown>)[k] as string;
  }, [lang]);
  const tbadges = useCallback(() => {
    const v = (dict[lang] as Record<string, unknown>)['hero.badges'];
    if (Array.isArray(v)) return v as string[];
    return [...((dict.en as Record<string, unknown>)['hero.badges'] as string[])];
  }, [lang]);
  const val = useMemo(() => ({ lang, setLang, toggleLang, t, tbadges }), [lang, setLang, toggleLang, t, tbadges]);
  return <Ctx.Provider value={val}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const v = useContext(Ctx);
  if (!v) return { lang: 'en', setLang: () => {}, toggleLang: () => {}, t: (k) => (dict.en as unknown as Record<string, string>)[k as string] ?? k, tbadges: () => [...((dict.en as unknown as Record<string, string[]>)['hero.badges'] as unknown as string[])] };
  return v;
}
