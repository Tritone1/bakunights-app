import { Check, ChevronDown, Languages } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "../context/LanguageContext";
import type { AppLanguage } from "../lib/translations";

const options: Array<{ value: AppLanguage; label: string; name: string }> = [
  { value: "en", label: "EN", name: "English" },
  { value: "az", label: "AZ", name: "Azərbaycan dili" },
  { value: "ru", label: "RU", name: "Русский" },
];

export function LanguageSwitcher({ floating = false }: { floating?: boolean }) {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const ariaLabel = language === "az" ? "Dil seçimi" : language === "ru" ? "Выбор языка" : "Language selection";

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const selected = options.find((option) => option.value === language) ?? options[0]!;
  return <div ref={containerRef} className={`language-switcher${floating ? " language-switcher-floating" : ""}`} data-no-translate>
    <button type="button" className="language-switcher-trigger" onClick={() => setOpen((current) => !current)} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}>
      <Languages size={16} aria-hidden="true" />
      <span>{selected.label}</span>
      <ChevronDown className={open ? "rotate-180" : ""} size={14} aria-hidden="true" />
    </button>
    {open && <div className="language-switcher-menu" role="listbox" aria-label={ariaLabel}>
      {options.map((option) => <button
        key={option.value}
        type="button"
        className="language-switcher-option"
        data-active={language === option.value}
        onClick={() => { setLanguage(option.value); setOpen(false); }}
        role="option"
        aria-selected={language === option.value}
      ><span><strong>{option.label}</strong>{option.name}</span>{language === option.value && <Check size={16} aria-hidden="true" />}</button>)}
    </div>}
  </div>;
}
