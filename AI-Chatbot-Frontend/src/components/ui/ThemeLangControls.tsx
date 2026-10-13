import { useEffect, useState } from 'react';
import { MdDarkMode, MdLightMode, MdTranslate } from 'react-icons/md';
import { applyTheme, getStoredTheme } from '@/lib/theme';
import { useLang } from '@/lib/i18n';

export function useThemeState() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return getStoredTheme(); } catch { return 'light'; }
  });
  useEffect(() => {
    try { applyTheme(theme); } catch { /* ignore */ }
  }, [theme]);
  return { theme, setTheme };
}

export function ThemeToggle({ theme, onToggle, compact }: { theme: 'light' | 'dark'; onToggle: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      className={compact ? 'tl-icon-btn' : 'tl-pill-btn'}
      onClick={onToggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      {theme === 'dark' ? <MdLightMode size={17} /> : <MdDarkMode size={17} />}
      {!compact && <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>}
    </button>
  );
}

export function LangToggle({ compact }: { compact?: boolean }) {
  const { lang, toggleLang } = useLang();
  return (
    <button
      type="button"
      className={compact ? 'tl-icon-btn' : 'tl-pill-btn'}
      onClick={toggleLang}
      aria-label={lang === 'en' ? 'বাংলায় দেখো' : 'View in English'}
      title={lang === 'en' ? 'বাংলা' : 'English'}
    >
      <MdTranslate size={17} />
      <span className="tl-lang-text">{lang === 'en' ? 'বাংলা' : 'EN'}</span>
    </button>
  );
}

export function ThemeLangControls({ compact }: { compact?: boolean }) {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return getStoredTheme(); } catch { return 'light'; }
  });
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { applyTheme(next); } catch { /* ignore */ }
  };
  useEffect(() => {
    try { applyTheme(theme); } catch { /* ignore */ }
  }, [theme]);
  return (
    <div className="tl-controls" role="group" aria-label="Theme and language">
      <ThemeToggle theme={theme} onToggle={toggle} compact={compact} />
      <LangToggle compact={compact} />
    </div>
  );
}
