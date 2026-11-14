import { parseAssignments, playerModelUrl, sanitizeAssetFile } from '../data/assets';
import { readStorage, writeStorage } from './storage';

const KEY = 'asset_assignments';

export function getAssignments(): Record<string, string> {
  return parseAssignments(readStorage<unknown>(KEY, {}));
}

/** Simpan/hapus pilihan model untuk sebuah peran. `file = null` mengembalikan ke bawaan. */
export function setAssignment(role: string, file: string | null): Record<string, string> {
  const next = getAssignments();
  const safe = file === null ? null : sanitizeAssetFile(file);
  if (safe) next[role] = safe;
  else delete next[role];
  writeStorage(KEY, next);
  return parseAssignments(next);
}

export function currentPlayerModelUrl(): string {
  return playerModelUrl(getAssignments());
}
