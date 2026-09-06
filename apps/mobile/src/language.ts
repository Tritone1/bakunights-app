export type AppLanguage = "en" | "az" | "ru";

function deviceLanguage(): AppLanguage {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
  return locale.startsWith("az") ? "az" : locale.startsWith("ru") ? "ru" : "en";
}

let currentLanguage: AppLanguage = deviceLanguage();

export function getAppLanguage() {
  return currentLanguage;
}

export function setAppLanguage(language: AppLanguage) {
  currentLanguage = language;
}
