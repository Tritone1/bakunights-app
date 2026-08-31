import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { translateUiText, type AppLanguage } from "../lib/translations";

type LanguageContextValue = {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => void;
};

type TranslationRecord = { source: string; output: string };

const STORAGE_KEY = "wheretogo-language";
const LanguageContext = createContext<LanguageContextValue | null>(null);
const textRecords = new WeakMap<Text, TranslationRecord>();
const attributeRecords = new WeakMap<Element, Map<string, TranslationRecord>>();
const translatedAttributes = ["placeholder", "title", "aria-label", "alt"] as const;

function initialLanguage(): AppLanguage {
  const language = document.documentElement.dataset.language;
  return language === "az" || language === "ru" ? language : "en";
}

function shouldSkip(node: Node) {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
  return Boolean(element?.closest("script, style, code, [data-no-translate], [translate='no']"));
}

function localizeTextNode(node: Text, language: AppLanguage) {
  if (shouldSkip(node)) return;
  const current = node.data;
  let record = textRecords.get(node);
  if (!record || current !== record.output) record = { source: current, output: current };
  const output = translateUiText(record.source, language);
  record.output = output;
  textRecords.set(node, record);
  if (current !== output) node.data = output;
}

function localizeAttribute(element: Element, attribute: typeof translatedAttributes[number], language: AppLanguage) {
  const current = element.getAttribute(attribute);
  if (current == null) return;
  let records = attributeRecords.get(element);
  if (!records) { records = new Map(); attributeRecords.set(element, records); }
  let record = records.get(attribute);
  if (!record || current !== record.output) record = { source: current, output: current };
  const output = translateUiText(record.source, language);
  record.output = output;
  records.set(attribute, record);
  if (current !== output) element.setAttribute(attribute, output);
}

function localizeTree(root: Node, language: AppLanguage) {
  if (shouldSkip(root)) return;
  if (root.nodeType === Node.TEXT_NODE) { localizeTextNode(root as Text, language); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const element = root as Element;
  translatedAttributes.forEach((attribute) => localizeAttribute(element, attribute, language));
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) localizeTextNode(node as Text, language);
    else translatedAttributes.forEach((attribute) => localizeAttribute(node as Element, attribute, language));
    node = walker.nextNode();
  }
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<AppLanguage>(initialLanguage);

  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;
    document.title = language === "az"
      ? "WhereToGo — Möhtəşəm yemək. Möhtəşəm təkliflər. Hər gün."
      : language === "ru" ? "WhereToGo — Отличная еда. Отличные предложения. Каждый день." : "WhereToGo — Great Food. Great Deals. Every Day.";
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute("content", language === "az"
      ? "WhereToGo hər gün möhtəşəm yeməklər və təkliflər tapmağa kömək edir."
      : language === "ru" ? "WhereToGo помогает каждый день находить отличную еду и выгодные предложения." : "WhereToGo helps you discover great food and great deals every day.");
    try { window.localStorage.setItem(STORAGE_KEY, language); } catch { /* Language still applies when storage is unavailable. */ }
    localizeTree(document.body, language);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") localizeTextNode(mutation.target as Text, language);
        else if (mutation.type === "attributes") localizeAttribute(mutation.target as Element, mutation.attributeName as typeof translatedAttributes[number], language);
        else mutation.addedNodes.forEach((node) => localizeTree(node, language));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: [...translatedAttributes] });
    return () => observer.disconnect();
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage }), [language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}
