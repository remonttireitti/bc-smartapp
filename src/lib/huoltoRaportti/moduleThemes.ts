import type { ModuleKey } from './constants';

export type ModuleThemeKey = ModuleKey | 'kylmaaineCharge' | 'huomiot' | 'vjOhjaus';

export type ModuleTheme = {
  accent: string;
  bg: string;
  border: string;
  header: string;
};

export const MODULE_THEMES: Record<ModuleThemeKey, ModuleTheme> = {
  kylmaaineCharge: { accent: '#1d4ed8', bg: '#eff6ff', border: '#93c5fd', header: '#2563eb' },
  kylmaainePiiri: { accent: '#1e40af', bg: '#dbeafe', border: '#60a5fa', header: '#1d4ed8' },
  hoyrystin: { accent: '#0e7490', bg: '#ecfeff', border: '#22d3ee', header: '#0891b2' },
  lauhdutin: { accent: '#6d28d9', bg: '#f5f3ff', border: '#a78bfa', header: '#7c3aed' },
  mlpPiirit: { accent: '#be185d', bg: '#fdf2f8', border: '#f472b6', header: '#db2777' },
  konvektorit: { accent: '#c2410c', bg: '#fff7ed', border: '#fb923c', header: '#ea580c' },
  ulkoyksikko: { accent: '#15803d', bg: '#f0fdf4', border: '#4ade80', header: '#16a34a' },
  sisayksikko: { accent: '#047857', bg: '#ecfdf5', border: '#34d399', header: '#059669' },
  mittaukset: { accent: '#0f766e', bg: '#f0fdfa', border: '#2dd4bf', header: '#0d9488' },
  vedenjajahdytyskone: { accent: '#0369a1', bg: '#e0f2fe', border: '#38bdf8', header: '#0284c7' },
  nestelauhduttimet: { accent: '#075985', bg: '#e0f2fe', border: '#0ea5e9', header: '#0284c7' },
  vapaajahdytys: { accent: '#0e7490', bg: '#ecfeff', border: '#06b6d4', header: '#0891b2' },
  tiiveyskoe: { accent: '#b91c1c', bg: '#fef2f2', border: '#f87171', header: '#dc2626' },
  tyhjiointi: { accent: '#4338ca', bg: '#eef2ff', border: '#818cf8', header: '#6366f1' },
  huomiot: { accent: '#a16207', bg: '#fefce8', border: '#facc15', header: '#ca8a04' },
  vjOhjaus: { accent: '#4f46e5', bg: '#eef2ff', border: '#818cf8', header: '#6366f1' },
};

export function getModuleTheme(key: ModuleThemeKey): ModuleTheme {
  return MODULE_THEMES[key];
}

export function moduleThemeKeyForOption(key: ModuleKey): ModuleThemeKey {
  return key;
}
