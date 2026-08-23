"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { messages, type Locale } from "@cnpaf/shared";

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (typeof messages)["zh"];
};

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("zh");
  useEffect(() => {
    const stored = localStorage.getItem("cnpaf.locale") as Locale | null;
    if (stored === "en" || stored === "zh") setLocaleState(stored);
  }, []);
  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("cnpaf.locale", l);
    document.documentElement.lang = l;
  };
  const value = useMemo(() => ({ locale, setLocale, t: messages[locale] }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n outside provider");
  return ctx;
}
