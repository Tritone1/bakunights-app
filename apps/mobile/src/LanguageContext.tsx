import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAppLanguage, setAppLanguage, type AppLanguage } from "./language";
import { translateUiText } from "./translations";

type LanguageValue = { language: AppLanguage; cycleLanguage: () => void; translate: (value: string) => string };
const LanguageContext = createContext<LanguageValue | null>(null);
const languages: AppLanguage[] = ["en", "az", "ru"];
const STORAGE_KEY = "wheretogo-language";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState(getAppLanguage);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY).then((stored) => {
      if (!active || !stored || !languages.includes(stored as AppLanguage)) return;
      const restored = stored as AppLanguage;
      setAppLanguage(restored);
      updateLanguage(restored);
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  const value = useMemo(() => ({
    language,
    cycleLanguage() {
      const next = languages[(languages.indexOf(language) + 1) % languages.length] ?? "en";
      setAppLanguage(next);
      updateLanguage(next);
      void AsyncStorage.setItem(STORAGE_KEY, next);
    },
    translate(value: string) { return translateUiText(value, language); },
  }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
