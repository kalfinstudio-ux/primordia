import { type WeatherType } from '../config';
import { eventBus } from '../core/eventBus';
import { gameState, setScreen } from '../core/state';
import { BALANCE } from '../data/balance';
import {
  BRUK_STORM_SHELTER_SEC,
  brukLevel,
  brukTrust,
  evaluateBruk,
  pickBrukResourceHint,
  selectBrukTalkLine,
  stepBrukStormSanctuary,
  withEndingMoment,
  type BrukChoice,
  type BrukFacts,
} from '../data/bruk';
import { saveGame } from './saveLoad';
import { distance2D } from '../utils/math';
import { t } from '../utils/i18n';

const STORMS: ReadonlySet<WeatherType> = new Set<WeatherType>(['ash_storm', 'acid_rain', 'electrical_storm', 'meteor_shower']);
const CHECK_EVERY_SEC = 1;

/** Dialog Bruk yang sedang menunggu tampil (dibaca BrukDialog bila ia baru dipasang). */
export interface BrukSayPayload {
  /** Kunci i18n berurutan. */
  lines: string[];
  level: number;
  trust: number;
}

export interface BrukTalkContextInput {
  isNight: boolean;
  weather: WeatherType;
}

/**
 * Sistem Bruk: momen kepercayaan, ingatan, dialog kontekstual (tombol Bicara),
 * serta hadiah mekanis (petunjuk sumber daya di peta & jeda badai singkat di tingkat 3–4).
 */
export class BrukSystem {
  private timer = 0;
  private stormShelterSec = 0;
  private stormSurvived = false;

  /** Panggil dengan `reset()` saat dunia dimuat/permainan baru agar penghitung bersih. */
  reset(): void {
    this.timer = 0;
    this.stormShelterSec = 0;
    this.stormSurvived = false;
    gameState.stormSanctuaryActive = false;
  }

  private applyResourceHintWaypoint(level: number): void {
    if (level <= 0 || level <= gameState.brukMemory.lastHintLevel) return;
    const hint = pickBrukResourceHint(level, gameState.playerPos.x, gameState.playerPos.z);
    if (!hint) return;
    gameState.brukMemory = { ...gameState.brukMemory, lastHintLevel: level };
    // Preserve player-placed custom pin if they have a manual waypoint; only replace old Bruk hint or fill empty slot
    const existing = gameState.customWaypoints[0];
    if (!existing || existing.id.startsWith('bruk_hint_')) {
      gameState.customWaypoints = [
        {
          id: hint.id,
          x: hint.x,
          z: hint.z,
          label: `${t('bruk.hintLabel')}: ${t(hint.labelKey)}`,
        },
      ];
      eventBus.emit('toast:show', { text: `${t('bruk.hintWaypointToast')} (${t(hint.labelKey)})`, type: 'info' });
    }
  }

  /** Player talks directly to Bruk via [E] or mobile ACTION button. */
  talk(ctx: BrukTalkContextInput): void {
    if (gameState.screen !== 'hud' || !gameState.activeWorldLoaded) return;
    const trust = brukTrust(gameState.brukMoments, gameState.completedQuests.length);
    const level = brukLevel(trust);
    const campfireCount = gameState.placedStructures.filter((s) => s.type === 'campfire_kit').length;
    const v = gameState.vitals;
    const injured = v.health < 60 || v.burnTimer > 0 || v.woundTimer > 0 || v.suffocationTimer > 0;

    const picked = selectBrukTalkLine(
      {
        level,
        isNight: ctx.isNight,
        storm: STORMS.has(ctx.weather),
        playerInjured: injured,
        fireOut: campfireCount === 0,
        playtimeSec: gameState.playtimeSec,
        recentViolation: false,
      },
      gameState.brukMemory
    );
    gameState.brukMemory = picked.memory;
    eventBus.emit<BrukSayPayload>('bruk:say', { lines: [picked.key], level, trust });

    // Talking at trust 1..4 also ensures resource waypoint hint is offered if not yet issued
    this.applyResourceHintWaypoint(level);
  }

  update(dt: number, weather: WeatherType, brukPos?: { x: number; z: number }): void {
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
      if (this.stormShelterSec >= BRUK_STORM_SHELTER_SEC) this.stormSurvived = true;
      this.stormShelterSec = 0;
    }

    // Mechanical reward: Trust 3–4 brief storm sanctuary near Bruk
    const trustNow = brukTrust(gameState.brukMoments, gameState.completedQuests.length);
    const levelNow = brukLevel(trustNow);
    const distToBruk = brukPos ? distance2D(px, pz, brukPos.x, brukPos.z) : Infinity;
    const sanctuary = stepBrukStormSanctuary(gameState.brukMemory, {
      level: levelNow,
      storm: STORMS.has(weather),
      playerDist: distToBruk,
      playtimeSec: gameState.playtimeSec,
    });
    gameState.brukMemory = sanctuary.memory;
    gameState.stormSanctuaryActive = sanctuary.active;
    if (sanctuary.activatedNow) {
      eventBus.emit('toast:show', { text: t('bruk.stormSanctuary'), type: 'success' });
    }

    this.timer += dt;
    if (this.timer < CHECK_EVERY_SEC) return;
    this.timer = 0;

    // Passive close meeting update if player stands near Bruk (< 4.5m)
    if (distToBruk <= BALANCE.bruk.talkRangeM + 0.5 && gameState.brukMemory.lastMeetingSec < 0) {
      gameState.brukMemory = { ...gameState.brukMemory, lastMeetingSec: gameState.playtimeSec };
    }

    const facts: BrukFacts = {
      completedQuests: gameState.completedQuests,
      campfireCount: gameState.placedStructures.filter((s) => s.type === 'campfire_kit').length,
      hasShelter: gameState.placedStructures.some((s) => s.type === 'basic_shelter'),
      stormSurvived: this.stormSurvived || gameState.brukMoments.includes('storm_survived'),
      campaignComplete: gameState.campaignComplete,
      brukChoice: gameState.brukChoice,
    };
    if (gameState.campaignComplete && gameState.brukChoice === null) {
      setScreen('victory');
      return;
    }
    const res = evaluateBruk(gameState.brukMoments, facts);
    if (res.moments.length !== gameState.brukMoments.length) {
      gameState.brukMoments = res.moments;
      if (res.lines.length > 0) {
        eventBus.emit<BrukSayPayload>('bruk:say', { lines: res.lines, level: res.level, trust: res.trust });
      }
      this.applyResourceHintWaypoint(res.level);
    }
  }
}

/** Dipanggil layar kemenangan saat pemain memilih nasib waktu. Menyimpan pilihan dan menandai momen `ending`. */
export function chooseBrukEnding(choice: BrukChoice): void {
  if (gameState.brukChoice !== null) return;
  gameState.brukChoice = choice;
  gameState.brukMoments = withEndingMoment(gameState.brukMoments);
  saveGame();
}
