// Mode tampilan HUD: Penuh → Ringkas → Bersih. Murni (tanpa React/THREE) agar mudah dites.
// Disimpan di localStorage (primordia_hud_mode); tombol mata di HUD / tombol keyboard H mengganti mode.
import { readStorage, writeStorage } from './storage';

export type HudMode = 'full' | 'compact' | 'clean';

export const HUD_MODES: readonly HudMode[] = ['full', 'compact', 'clean'];

export function isHudMode(v: unknown): v is HudMode {
  return v === 'full' || v === 'compact' || v === 'clean';
}

export function nextHudMode(m: HudMode): HudMode {
  return HUD_MODES[(HUD_MODES.indexOf(m) + 1) % HUD_MODES.length];
}

/** Apa yang boleh tampil pada tiap mode. Satu sumber kebenaran untuk HUD & toast. */
export interface HudVisibility {
  clock: boolean; // jam, tanggal, umur, musim
  vitalsFull: boolean; // semua bar (stamina, suhu, oksigen, hidrasi)
  vitalsBasic: boolean; // minimal bar nyawa (+ oksigen bila rendah)
  quest: boolean; // panel misi
  minimap: boolean;
  compass: boolean; // kompas + bioma + cuaca
  hazardPills: boolean; // status bahaya, peringatan, panah petunjuk, event, online
  tutorial: boolean;
  controlsHint: boolean;
  menuButtons: boolean; // Peta/Jurnal/Tas/... (bila false hanya tombol mata + jeda)
  toasts: 'all' | 'warn' | 'none';
  criticalVignette: boolean; // tepi layar berkedip merah saat kritis
}

export function hudVisibility(m: HudMode): HudVisibility {
  switch (m) {
    case 'full':
      return {
        clock: true, vitalsFull: true, vitalsBasic: true, quest: true, minimap: true, compass: true,
        hazardPills: true, tutorial: true, controlsHint: true, menuButtons: true, toasts: 'all', criticalVignette: false,
      };
    case 'compact':
      return {
        clock: false, vitalsFull: false, vitalsBasic: true, quest: false, minimap: false, compass: false,
        hazardPills: true, tutorial: false, controlsHint: false, menuButtons: true, toasts: 'warn', criticalVignette: false,
      };
    case 'clean':
      return {
        clock: false, vitalsFull: false, vitalsBasic: false, quest: false, minimap: false, compass: false,
        hazardPills: false, tutorial: false, controlsHint: false, menuButtons: false, toasts: 'none', criticalVignette: true,
      };
  }
}

/** Kondisi kritis yang tetap diberi isyarat minimal (vinyet merah) di mode Bersih. */
export function isCriticalState(v: { health: number; oxygen: number; water: number }, suffocating: boolean): boolean {
  return suffocating || v.health <= 30 || v.water <= 3 || v.oxygen <= 1;
}

const KEY = 'hud_mode';
let current: HudMode = (() => {
  const saved = readStorage<unknown>(KEY, 'full');
  return isHudMode(saved) ? saved : 'full';
})();
const listeners = new Set<() => void>();

export function getHudMode(): HudMode {
  return current;
}

export function setHudMode(m: HudMode): void {
  if (m === current) return;
  current = m;
  writeStorage(KEY, m);
  listeners.forEach((l) => l());
}

export function cycleHudMode(): HudMode {
  setHudMode(nextHudMode(current));
  return current;
}

export function subscribeHudMode(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
