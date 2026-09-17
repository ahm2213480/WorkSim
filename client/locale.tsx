import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { messages, type Locale } from './messages';

export type MessageKey = keyof (typeof messages)['en'];
/** Both dictionaries share the same keys (enforced by messages.test.ts), so
 *  either one satisfies this shape and components can read `t.<key>` safely. */
export type Dictionary = Record<MessageKey, string>;

interface LocaleContextValue {
  locale: Locale;
  toggleLocale: () => void;
  t: Dictionary;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

function initialLocale(): Locale {
  try { return localStorage.getItem('worksim-locale') === 'ar' ? 'ar' : 'en'; }
  catch { return 'en'; }
}

/** Owns the active language for the whole app: exposes it via useLocale() and
 *  mirrors it onto <html lang/dir> plus the tab title so RTL and Arabic
 *  typography apply everywhere, on every page, from one place. */
export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.title = locale === 'ar' ? 'WorkSim — جرّب العمل الحقيقي' : 'WorkSim — Practice real work';
    try { localStorage.setItem('worksim-locale', locale); } catch { /* Language still works when storage is blocked. */ }
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    toggleLocale: () => setLocale((current) => (current === 'en' ? 'ar' : 'en')),
    t: messages[locale],
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used inside LocaleProvider.');
  return context;
}
