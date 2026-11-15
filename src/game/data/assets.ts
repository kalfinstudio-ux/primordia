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

// ── Gerbang karakter (Fase 1 / Gerbang 2) ──
// Target perangkat: HP murah/lama (keputusan pemilik, 15 Nov 2026). Ubah angka di sini bila target berubah.
export const CHARACTER_ROLES: readonly string[] = ['player', 'adam', 'hawa'];

export const CHARACTER_BUDGET = {
  /** Segitiga maksimum model yang dipasang (LOD0). LOD1 ≈ 3.000, LOD2 ≈ 1.000 menyusul. */
  maxTriangles: 8_000,
  maxBytes: 2 * 1024 * 1024,
  /** Tekstur > warnTexturePx memberi peringatan; > maxTexturePx ditolak. */
  warnTexturePx: 512,
  maxTexturePx: 1024,
  /** Rangka humanoid sehat ±50–65 sendi; di atas ini membebani skinning di HP lama. */
  maxJoints: 75,
} as const;

export interface AssetLicense {
  /** Mis. "CC0", "CC-BY 4.0", "Mixamo (Adobe)". */
  license: string;
  /** Sumber/pembuat — wajib agar atribusi bisa ditulis di Kredit. */
  source: string;
}

/**
 * Catatan lisensi per berkas model. Model karakter TANPA entri di sini ditolak gerbang.
 * Tambahkan entri hanya setelah lisensi benar-benar diperiksa; lalu tulis atribusi di ui/CreditsScreen.tsx.
 */
export const ASSET_LICENSES: Readonly<Record<string, AssetLicense>> = {};

export interface CharacterInfo extends AssetInfo {
  /** Jumlah sendi (bone) pada rangka; 0 = tanpa rangka. */
  joints: number;
  /** Sisi terpanjang tekstur terbesar (px); 0 = tanpa tekstur. */
  maxTexturePx: number;
  license: AssetLicense | null;
}

export interface GateResult {
  ok: boolean;
  /** Alasan penolakan — model tidak boleh dipakai untuk peran karakter. */
  blockers: string[];
  warnings: string[];
}

/** Gerbang aset karakter: lolos hanya bila punya rangka, klip inti, dalam anggaran, dan lisensi tercatat. */
export function characterGate(info: CharacterInfo): GateResult {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const B = CHARACTER_BUDGET;
  if (!isWebLoadable(assetFormat(info.file))) {
    return { ok: false, blockers: [`Format .${assetFormat(info.file)} tidak bisa dimuat browser — konversi ke .glb dulu.`], warnings };
  }
  if (info.joints <= 0) blockers.push('Tanpa rangka (skeleton) — karakter tidak bisa dianimasikan.');
  else if (info.joints > B.maxJoints) warnings.push(`Rangka ${info.joints} sendi (disarankan ≤${B.maxJoints}) — berat untuk HP lama.`);
  const missing = missingCoreClips(info.clipNames);
  if (info.clipNames.length === 0) blockers.push('Tanpa klip animasi (butuh idle, walk, run).');
  else if (missing.length > 0) blockers.push(`Klip inti hilang: ${missing.join(', ')}.`);
  if (info.triangles > B.maxTriangles) {
    blockers.push(`Segitiga ${info.triangles.toLocaleString('id-ID')} melebihi anggaran ${B.maxTriangles.toLocaleString('id-ID')} (HP lama).`);
  }
  if (info.bytes !== null && info.bytes > B.maxBytes) {
    blockers.push(`Ukuran ${(info.bytes / 1048576).toFixed(1)} MB melebihi anggaran ${(B.maxBytes / 1048576).toFixed(0)} MB.`);
  }
  if (info.maxTexturePx > B.maxTexturePx) blockers.push(`Tekstur ${info.maxTexturePx}px melebihi ${B.maxTexturePx}px.`);
  else if (info.maxTexturePx > B.warnTexturePx) warnings.push(`Tekstur ${info.maxTexturePx}px; 512px lebih aman untuk HP lama.`);
  if (!info.license) blockers.push('Belum ada catatan lisensi (tambahkan di ASSET_LICENSES, assets.ts).');
  return { ok: blockers.length === 0, blockers, warnings };
}

/** Peran karakter hanya boleh diisi model yang lolos gerbang. Peran lain bebas. */
export function canAssignRole(role: string, gate: GateResult | null): boolean {
  if (!CHARACTER_ROLES.includes(role)) return true;
  return gate?.ok === true;
}
