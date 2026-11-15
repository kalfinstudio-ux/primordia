import { type WeatherType } from '../config';
import { eventBus } from '../core/eventBus';
import { gameState } from '../core/state';
import { BRUK_STORM_SHELTER_SEC, evaluateBruk, type BrukFacts } from '../data/bruk';
import { distance2D } from '../utils/math';

const STORMS: ReadonlySet<WeatherType> = new Set<WeatherType>(['ash_storm', 'acid_rain', 'electrical_storm', 'meteor_shower']);
const CHECK_EVERY_SEC = 1;

/** Dialog Bruk yang sedang menunggu tampil (dibaca BrukDialog bila ia baru dipasang). */
export interface BrukSayPayload {
  /** Kunci i18n berurutan. */
  lines: string[];
  level: number;
  trust: number;
}

/**
 * Pemicu Bruk tingkat 1: tiap detik memeriksa fakta dunia, menandai momen baru di
 * `gameState.brukMoments`, dan memancarkan `bruk:say`. Tidak memengaruhi angka survival.
 */
export class BrukSystem {
  private timer = 0;
  private stormShelterSec = 0;
  private stormSurvived = false;

  /** Panggil dengan `reset()` saat dunia dimuat/permainan baru agar penghitung badai bersih. */
  reset(): void {
    this.timer = 0;
    this.stormShelterSec = 0;
    this.stormSurvived = false;
  }

  update(dt: number, weather: WeatherType): void {
    if (gameState.screen !== 'hud' || !gameState.activeWorldLoaded) return;

    const px = gameState.playerPos.x;
    const pz = gameState.playerPos.z;
    const inShelter = gameState.placedStructures.some(
      (s) => (s.type === 'basic_shelter' || s.type === 'roof_panel') && distance2D(px, pz, s.x, s.z) < 4.5
    );
    if (STORMS.has(weather) && inShelter) {
      this.stormShelterSec += dt;
      if (this.stormShelterSec >= BRUK_STORM_SHELTER_SEC) this.stormSurvived = true;
    } else if (!STORMS.has(weather)) {
      // Badai berlalu → jika sempat berlindung cukup lama, itu "selamat dari badai".
      if (this.stormShelterSec >= BRUK_STORM_SHELTER_SEC) this.stormSurvived = true;
      this.stormShelterSec = 0;
    }

    this.timer += dt;
    if (this.timer < CHECK_EVERY_SEC) return;
    this.timer = 0;

    const facts: BrukFacts = {
      completedQuests: gameState.completedQuests,
      campfireCount: gameState.placedStructures.filter((s) => s.type === 'campfire_kit').length,
      hasShelter: gameState.placedStructures.some((s) => s.type === 'basic_shelter'),
      stormSurvived: this.stormSurvived || gameState.brukMoments.includes('storm_survived'),
      campaignComplete: gameState.campaignComplete,
    };
    const res = evaluateBruk(gameState.brukMoments, facts);
    if (res.moments.length !== gameState.brukMoments.length) {
      gameState.brukMoments = res.moments;
      if (res.lines.length > 0) {
        eventBus.emit<BrukSayPayload>('bruk:say', { lines: res.lines, level: res.level, trust: res.trust });
      }
    }
  }
}
