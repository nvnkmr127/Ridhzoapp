"use client";

import * as React from "react";
import { t, type Lang } from "@/lib/i18n";

const Ctx = React.createContext<Lang>("en");

// The signed-in person's language (users.language), set once in the dashboard layout.
export function LanguageProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  return <Ctx.Provider value={lang}>{children}</Ctx.Provider>;
}

export function useT() {
  const lang = React.useContext(Ctx);
  return React.useCallback((text: string, vars?: Record<string, string | number>) => t(lang, text, vars), [lang]);
}
