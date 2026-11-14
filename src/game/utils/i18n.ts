import idDict from '../../i18n/id.json';
import enDict from '../../i18n/en.json';
import type { LanguageCode } from '../config';
import { eventBus } from '../core/eventBus';

type Dict = Record<string, unknown>;

const dictionaries: Record<LanguageCode, Dict> = {
  id: idDict as Dict,
  en: enDict as Dict,
};

let currentLanguage: LanguageCode = 'id';

export function getLanguage(): LanguageCode {
  return currentLanguage;
}

export function setLanguage(lang: LanguageCode): void {
  if (lang !== 'id' && lang !== 'en') return;
  currentLanguage = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
  eventBus.emit('language:changed', lang);
}

export function t(key: string): string {
  const parts = key.split('.');
  let node: unknown = dictionaries[currentLanguage];
  for (const part of parts) {
    if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      node = undefined;
      break;
    }
  }
  if (typeof node === 'string') return node;

  // Fallback to English if missing in Indonesian
  let fallback: unknown = dictionaries.en;
  for (const part of parts) {
    if (fallback && typeof fallback === 'object' && part in (fallback as Record<string, unknown>)) {
      fallback = (fallback as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof fallback === 'string' ? fallback : key;
}

export function getTipList(): string[] {
  const list = (dictionaries[currentLanguage] as { tips?: string[] }).tips;
  return Array.isArray(list) ? list : [];
}

/** Ambil simpul mentah (objek/array) dari kamus bahasa aktif; jatuh ke Inggris bila tak ada. */
export function tRaw(key: string): unknown {
  const walk = (root: unknown): unknown => {
    let node: unknown = root;
    for (const part of key.split('.')) {
      if (node && typeof node === 'object' && part in (node as Record<string, unknown>)) {
        node = (node as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }
    return node;
  };
  return walk(dictionaries[currentLanguage]) ?? walk(dictionaries.en);
}
