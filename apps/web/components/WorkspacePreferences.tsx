'use client';
import { createContext, useContext, type ReactNode } from 'react';
export type Locale = 'fr' | 'en';
const Preferences = createContext({ locale: 'fr' as Locale, demo: false });
export function WorkspacePreferences({
  locale,
  demo,
  children,
}: {
  locale: Locale;
  demo: boolean;
  children: ReactNode;
}) {
  return <Preferences.Provider value={{ locale, demo }}>{children}</Preferences.Provider>;
}
export function useWorkspace() {
  const p = useContext(Preferences);
  return { ...p, t: (fr: string, en: string) => (p.locale === 'en' ? en : fr) };
}
export function LanguageControl() {
  const { locale } = useWorkspace();
  return (
    <label className="language-control">
      Language / Langue{' '}
      <select
        aria-label="Language / Langue"
        value={locale}
        onChange={(e) => {
          document.cookie = `vululu_lang=${e.target.value === 'en' ? 'en' : 'fr'}; Path=/; Max-Age=31536000; SameSite=Lax`;
          location.reload();
        }}
      >
        <option value="fr">Français</option>
        <option value="en">English</option>
      </select>
    </label>
  );
}
