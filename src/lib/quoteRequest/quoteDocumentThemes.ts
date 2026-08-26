export type QuoteTileThemeKey =
  | 'config'
  | 'device'
  | 'pricing'
  | 'terms'
  | 'notes'
  | 'customer'
  | 'site'
  | 'work';

export type QuoteTileTheme = {
  header: string;
};

export const QUOTE_TILE_THEMES: Record<QuoteTileThemeKey, QuoteTileTheme> = {
  config: { header: 'linear-gradient(135deg, #0d9488 0%, #14b8a6 100%)' },
  device: { header: 'linear-gradient(135deg, #ea580c 0%, #f97316 100%)' },
  pricing: { header: 'linear-gradient(135deg, #2563eb 0%, #3b82f6 100%)' },
  terms: { header: 'linear-gradient(135deg, #7c3aed 0%, #8b5cf6 100%)' },
  notes: { header: 'linear-gradient(135deg, #64748b 0%, #94a3b8 100%)' },
  customer: { header: 'linear-gradient(135deg, #db2777 0%, #ec4899 100%)' },
  site: { header: 'linear-gradient(135deg, #059669 0%, #10b981 100%)' },
  work: { header: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)' },
};

export type QuoteDocumentTileEntry<TId extends string = string> = {
  id: TId;
  title: string;
  subtitle: string;
  themeKey: QuoteTileThemeKey;
};
