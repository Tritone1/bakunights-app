import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { getAppLanguage, setAppLanguage, type AppLanguage } from "./language";

type LanguageValue = { language: AppLanguage; cycleLanguage: () => void };
const LanguageContext = createContext<LanguageValue | null>(null);
const languages: AppLanguage[] = ["en", "az", "ru"];

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState(getAppLanguage);
  const value = useMemo(() => ({
    language,
    cycleLanguage() {
      const next = languages[(languages.indexOf(language) + 1) % languages.length] ?? "en";
      setAppLanguage(next);
      updateLanguage(next);
    },
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
