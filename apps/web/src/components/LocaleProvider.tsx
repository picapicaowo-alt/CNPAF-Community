"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { messages, type Locale } from "@cnpaf/shared";

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (typeof messages)[Locale];
};

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({
  children,
  initialLocale = "zh",
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  useEffect(() => {
    const stored = localStorage.getItem("cnpaf.locale") as Locale | null;
    const nextLocale = stored === "en" || stored === "zh" ? stored : initialLocale;
    setLocaleState(nextLocale);
    document.documentElement.lang = nextLocale;
  }, [initialLocale]);
  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("cnpaf.locale", l);
    document.cookie = `cnpaf.locale=${l}; Path=/; Max-Age=31536000; SameSite=Lax`;
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
