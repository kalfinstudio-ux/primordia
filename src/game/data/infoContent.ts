/** Daftar kunci i18n untuk panel "Panduan & Info" (Pengaturan). Teksnya ada di src/i18n/{id,en}.json → "info". */
export const INFO_SECTIONS = ['description', 'scheme', 'missions', 'guide', 'terms', 'privacy'] as const;
export type InfoSection = (typeof INFO_SECTIONS)[number];

const seq = (prefix: string, n: number): string[] => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

export const INFO_COUNTS = { description: 4, scheme: 10, steps: 8, tips: 8, terms: 9, privacy: 9, chapters: 5 } as const;

export const DESCRIPTION_KEYS = seq('p', INFO_COUNTS.description);
export const SCHEME_KEYS = seq('s', INFO_COUNTS.scheme);
export const STEP_KEYS = seq('st', INFO_COUNTS.steps);
export const TIP_KEYS = seq('ti', INFO_COUNTS.tips);
export const TERMS_KEYS = seq('c', INFO_COUNTS.terms);
export const PRIVACY_KEYS = seq('c', INFO_COUNTS.privacy);
export const CHAPTERS = [1, 2, 3, 4, 5] as const;

export const INFO_VERSION_DATE = '2026-11-14';
