/**
 * Registri aset 3D — logika murni (tanpa three) agar mudah dites.
 * Peran aset belum final: semua peran boleh kosong, dan peran kosong memakai model buatan kode.
 * Format tidak kaku: daftar nama file bisa diganti ke .glb/.gltf kapan saja; .usdz dan format lain
 * hanya ditandai "perlu konversi" (browser tidak bisa memuatnya langsung).
 */

export type AssetFormat = 'glb' | 'gltf' | 'usdz' | 'fbx' | 'obj' | 'unknown';

export function assetFormat(file: string): AssetFormat {
  const ext = file.toLowerCase().split('.').pop() || '';
  return (['glb', 'gltf', 'usdz', 'fbx', 'obj'] as const).find((f) => f === ext) ?? 'unknown';
}

/** Hanya glb/gltf yang bisa dimuat langsung oleh game. */
export function isWebLoadable(format: AssetFormat): boolean {
  return format === 'glb' || format === 'gltf';
}

export interface AssetRole {
  id: string;
  label: string;
  /** true = game sudah memakai peran ini; false = hanya disimpan untuk nanti. */
  wired: boolean;
}

export const ASSET_ROLES: readonly AssetRole[] = [
  { id: 'player', label: 'Karakter pemain', wired: true },
  { id: 'adam', label: 'Adam', wired: false },
  { id: 'hawa', label: 'Hawa', wired: false },
  { id: 'cave', label: 'Gua', wired: false },
  { id: 'animal', label: 'Hewan', wired: false },
  { id: 'enemy', label: 'Musuh', wired: false },
];

export interface AssetEntry {
  file: string;
  note: string;
}

/** Daftar model di public/play/models/. Tambah/ganti nama file di sini bila formatnya berubah. */
export const ASSET_FILES: readonly AssetEntry[] = [
  { file: 'naked_dude.glb', note: 'Ringan (0,23 MB)' },
  { file: 'party_starter_-_layered_t-shirts.glb', note: 'Sedang (0,93 MB)' },
  { file: 'daren_-_lod_man_character.glb', note: 'Berat (3,0 MB)' },
];

/** Model bawaan untuk peran pemain bila tidak ada pilihan (perilaku lama). */
export const DEFAULT_PLAYER_MODEL = 'explorer.glb';
export const MODELS_DIR = './models/';

/** Nama file aman: tanpa path, tanpa "..", dengan ekstensi model yang dikenal. */
export function sanitizeAssetFile(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const n = name.trim();
  if (!n || n.length > 120 || /[\\/]|\.\./.test(n) || /[\u0000-\u001f]/.test(n)) return null;
  return assetFormat(n) === 'unknown' ? null : n;
}

export function assetUrl(file: string): string {
  return MODELS_DIR + encodeURIComponent(file);
}

/** Bersihkan data pilihan dari penyimpanan: hanya peran dikenal + nama file aman. */
export function parseAssignments(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const role of ASSET_ROLES) {
    const file = sanitizeAssetFile((raw as Record<string, unknown>)[role.id]);
    if (file) out[role.id] = file;
  }
  return out;
}

/** URL model karakter pemain: pilihan pemain bila ada, kalau tidak model bawaan. */
export function playerModelUrl(assignments: Record<string, string>): string {
  return assetUrl(assignments.player || DEFAULT_PLAYER_MODEL);
}

// ── Klip animasi ──
export const CLIP_ALIASES: Record<string, string[]> = {
  idle: ['idle', 'stand', 'breath'],
  walk: ['walk', 'locomotion'],
  run: ['run', 'sprint', 'jog'],
  jump: ['jump', 'leap'],
  fall: ['fall', 'air'],
  swim: ['swim', 'tread'],
  mine: ['mine', 'gather', 'chop', 'attack', 'swing'],
  craft: ['craft', 'work'],
  hurt: ['hurt', 'hit', 'damage'],
  death: ['death', 'die'],
};

export const CORE_CLIPS = ['idle', 'walk', 'run'] as const;

/** Klip inti (idle/walk/run) yang tidak punya padanan nama di model. */
export function missingCoreClips(clipNames: readonly string[]): string[] {
  const lower = clipNames.map((c) => c.toLowerCase());
  return CORE_CLIPS.filter((state) => !lower.some((c) => CLIP_ALIASES[state].some((a) => c.includes(a))));
}

export const HEAVY_BYTES = 2 * 1024 * 1024;
export const HEAVY_TRIANGLES = 60_000;

export interface AssetInfo {
  file: string;
  bytes: number | null;
  triangles: number;
  clipNames: string[];
}

/** Peringatan yang perlu diketahui sebelum model dipakai di game (terutama di HP). */
export function assetWarnings(info: AssetInfo): string[] {
  const w: string[] = [];
  const fmt = assetFormat(info.file);
  if (!isWebLoadable(fmt)) {
    w.push(`Format .${fmt} tidak bisa dimuat browser — konversi ke .glb dulu (tools/optimize-assets.sh).`);
    return w;
  }
  if (info.bytes !== null && info.bytes > HEAVY_BYTES) {
    w.push(`Berat: ${(info.bytes / 1048576).toFixed(1)} MB — pertimbangkan kompres (meshopt/WebP) untuk HP.`);
  }
  if (info.triangles > HEAVY_TRIANGLES) {
    w.push(`Poligon banyak: ${info.triangles.toLocaleString('id-ID')} segitiga — bisa menurunkan FPS di HP.`);
  }
  const missing = missingCoreClips(info.clipNames);
  if (info.clipNames.length === 0) w.push('Tanpa animasi — model akan kaku saat berjalan.');
  else if (missing.length > 0) w.push(`Klip tidak ditemukan: ${missing.join(', ')}.`);
  return w;
}
