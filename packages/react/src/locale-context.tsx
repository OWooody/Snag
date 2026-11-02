import { createContext, useContext, useMemo, type ReactNode } from "react";

import { getSnagConfig } from "./config";
import {
  directionFor,
  plural,
  resolveLocale,
  translate,
  type MessageKey,
  type SnagDirection,
  type SnagLocale,
} from "./i18n";

export interface SnagStrings {
  locale: SnagLocale;
  dir: SnagDirection;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
  plural: (
    count: number,
    one: Extract<MessageKey, `${string}.one`>,
    other: Extract<MessageKey, `${string}.other`>,
  ) => string;
}

const SnagLocaleContext = createContext<SnagStrings | null>(null);

export function SnagLocaleProvider({ children }: { children: ReactNode }) {
  const locale = resolveLocale(getSnagConfig()?.locale);
  const value = useMemo<SnagStrings>(
    () => ({
      locale,
      dir: directionFor(locale),
      t: (key, vars) => translate(locale, key, vars),
      plural: (count, one, other) => plural(locale, count, one, other),
    }),
    [locale],
  );
  return <SnagLocaleContext.Provider value={value}>{children}</SnagLocaleContext.Provider>;
}

export function useSnagStrings(): SnagStrings {
  const value = useContext(SnagLocaleContext);
  if (value) return value;
  const locale = resolveLocale(getSnagConfig()?.locale);
  return {
    locale,
    dir: directionFor(locale),
    t: (key, vars) => translate(locale, key, vars),
    plural: (count, one, other) => plural(locale, count, one, other),
  };
}
