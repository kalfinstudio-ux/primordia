import {
  collectAnchors,
  effectivePropSeed,
  effectiveTerrainSeed,
  effectiveWaterLevel,
  formatShiftCountdown,
  getEdenCalendar,
  getWorldAge,
  safeRelocatePlayer,
  safeRelocateStructures,
  sanitizeClockSample,
  shiftWarning,
} from '../data/eden';
import {
  collectPlayerFootprints,
  combinedWorldVisuals,
  type WorldSeason,
} from '../data/worldEvolution';
import * as THREE from 'three';
import { AUTOSAVE_INTERVAL_SEC, WATER_LEVEL } from '../config';
import { Engine } from '../core/engine';
import {
  decideGraphicsTier,
  recordFpsSample,
  tierRank,
  type FpsSample,
  type TierTransitionDirection,
} from '../data/graphicsTier';
import { GameLoop } from '../core/loop';
import { input } from '../core/input';
import { loadProceduralAssets, type ProceduralAssets } from '../core/assetLoader';
import { SpatialHashGrid } from '../core/spatialHash';
import { gameState, saveSettingsToLocal, setScreen, type HudSnapshot, type StructureType } from '../core/state';
import { eventBus } from '../core/eventBus';
import { TerrainSystem } from '../world/terrain';
import { SkySystem } from '../world/sky';
import { LandmarkSilhouettes } from '../world/landmarks';
import { dangerLevel, getRegionAt, regionLabel } from '../world/regions';
import { WaterSystem } from '../world/water';
import { LavaSystem } from '../world/lava';
import { VolcanoSystem } from '../world/volcano';
import { WeatherSystem } from '../world/weather';
import { MeteorSystem } from '../world/meteors';
import { ChunkManager } from '../world/chunkManager';
import { RemotePlayersSystem } from '../world/remotePlayers';
import { BrukBody } from '../world/brukBody';
import { FaunaSystem } from '../world/faunaSystem';
import { multiplayer } from '../net/multiplayer';
import type { AnimState } from '../net/multiplayerProtocol';
import { VOLCANO_MAIN, WORLD_POIS, getBiomeAt, getLavaRiverCenterX } from '../world/biomes';
import { createExplorerCharacter, type CharacterRig } from '../player/character';
import { tryLoadExplorerGlb, type GlbExplorerHandle } from '../player/glbCharacter';
import { currentPlayerModelUrl } from '../utils/assetPrefs';
import { CharacterAnimator, actionKindFor } from '../player/animator';
import { PlayerController } from '../player/controller';
import { ThirdPersonCamera } from '../player/camera';
import { SurvivalSystem } from '../systems/survival';
import { BrukSystem } from '../systems/bruk';
import { performInteraction } from '../systems/interaction';
import { BuildingGhostSystem, tickStructures, tryPlaceStructure } from '../systems/building';
import { WorldEventSystem, evaluateContextualTutorial } from '../systems/events';
import { evaluateQuests } from '../systems/quests';
import {
  addItem,
  computeCarryWeight,
  getBestMiningToolId,
  getHotbarSlots,
  getMaxCarryWeightIn,
  hasItem,
  useHotbarSlot,
} from '../systems/inventory';
import { saveGame } from '../systems/saveLoad';
import { DeathBagView } from '../world/deathBagView';
import { findBagInRange, pickUpBag } from '../systems/deathBag';
import { pickRespawnPoint, relativeBearingDeg } from '../systems/cleanAir';
import { pickQuestGuide } from '../systems/questGuide';
import { BALANCE, isSafeStartActive } from '../data/balance';
import { isFallingFast } from '../data/survivalRates';
import { distance2D } from '../utils/math';
import { audioSystem } from '../systems/audio';
import type { SpatialAmbientKind } from '../data/audioMath';
import { t } from '../utils/i18n';

const _worldCenter = new THREE.Vector3(0, 0, 0);
const _camPos = new THREE.Vector3();
const _camFwd = new THREE.Vector3();
const _camUp = new THREE.Vector3();

export class SceneManager {
  private engine: Engine;
  private loop: GameLoop;
  private spatialHash = new SpatialHashGrid(8);
  private assets!: ProceduralAssets;
  private terrain!: TerrainSystem;
  private sky!: SkySystem;
  private landmarks!: LandmarkSilhouettes;
  private biomeTimer = 0;
  private lastRegionKey = '';
  private lastRegionToastMs = 0;
  private water!: WaterSystem;
  private lava!: LavaSystem;
  private volcano!: VolcanoSystem;
  private weather!: WeatherSystem;
  private shiftWarnKey = '';
  private meteors!: MeteorSystem;
  private chunks!: ChunkManager;
  private remotePlayers!: RemotePlayersSystem;
  private brukBody!: BrukBody;
  private fauna!: FaunaSystem;
  private buildingGhost!: BuildingGhostSystem;
  private character!: CharacterRig;
  private glbHandle: GlbExplorerHandle | null = null;
  private loadedGlbUrl = '';
  private glbLoadSeq = 0;
  private animator = new CharacterAnimator();
  private controller: PlayerController;
  private camRig = new ThirdPersonCamera();
  private survival = new SurvivalSystem();
  private bruk = new BrukSystem();
  private deathBagView!: DeathBagView;
  private worldEvents = new WorldEventSystem();

  private activeEvent: HudSnapshot['activeEvent'] = { type: 'none', remainingSec: 0 };
  private hudEmitAccum = 0;
  private autosaveAccum = 0;
  private fpsSamples = 0;
  private fpsAccum = 0;
  private currentFps = 60;
  private fpsHistory: FpsSample[] = [];
  private adaptiveTimeSec = 0;
  private lastTierChangeSec: number | null = null;
  private lastTierChangeDir: TierTransitionDirection | null = null;
  private isApplyingAdaptive = false;
  private lastBiomeSound = '';
  private ready = false;
  private appliedEdenSeed = '';
  private appliedYear = 0;
  private appliedEraYear = 1;
  private appliedSeason: WorldSeason = 'kering';
  private currentWaterLevel = WATER_LEVEL;
  private lastClockMs = 0;
  private edenCheckTimer = 0;
  private audioSpatialAccum = 0;
  private readonly spatialSrcBuf: Array<{ kind: SpatialAmbientKind; x: number; y: number; z: number; distance: number }> = [];
  private readonly spatialSlotLava = { kind: 'lava' as const, x: 0, y: 0, z: 0, distance: 999 };
  private readonly spatialSlotGeyser = { kind: 'geyser' as const, x: 0, y: 0, z: 0, distance: 999 };
  private readonly spatialSlotWater = { kind: 'water' as const, x: 0, y: 0, z: 0, distance: 999 };
  private readonly spatialSlotCampfire = { kind: 'campfire' as const, x: 0, y: 0, z: 0, distance: 999 };
  private readonly geyserCoordBuf: Array<{ x: number; z: number }> = [];
  private readonly geyserCoordPool: Array<{ x: number; z: number }> = [];
  private unsubs: Array<() => void> = [];

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    input.attach(this.engine.renderer.domElement);

    this.controller = new PlayerController({
      onJump: () => {
        this.animator.triggerJump();
        audioSystem.playSfx('jump');
      },
      onLand: (ev) => {
        this.animator.triggerLand();
        this.survival.applyFallDamage(ev.impactSpeed, ev.inWater, ev.immersed);
      },
      onFootstep: () =>
        audioSystem.playFootstep(this.survival.currentSurface, this.controller.lastHorizontalSpeed, gameState.wetness),
    });

    this.loop = new GameLoop(this.engine.renderer, {
      onFixedStep: (dt) => this.fixedStep(dt),
      onRender: (alpha, dt, elapsed) => this.renderFrame(alpha, dt, elapsed),
      isPaused: () =>
        this.engine.isSoftwareGl && !['hud', 'splash', 'onboarding', 'menu'].includes(gameState.screen),
    });

    this.registerBusEvents();
  }

  private registerBusEvents(): void {
    this.unsubs.push(
      eventBus.on('world:quake', (p) => {
        const data = p as { intensity?: number };
        this.camRig.addTrauma(data?.intensity ?? 0.35);
      }),
      eventBus.on('world:lightning', (p) => {
        const data = p as { dist?: number };
        if (typeof data?.dist === 'number' && data.dist < 3.6) {
          this.survival.applyLightningHit(data.dist);
          this.camRig.addTrauma(0.55);
        }
      }),
      eventBus.on('world:requestPlaceStructure', (kind) => {
        if (!this.ready) return;
        gameState.buildModeItem = kind as StructureType;
        setScreen('hud');
      }),
      eventBus.on('world:confirmBuild', () => {
        if (this.ready) this.confirmBuildPlacement();
      }),
      eventBus.on('world:rotateBuild', () => {
        gameState.buildRotOffset += Math.PI / 2;
      }),
      eventBus.on('settings:updated', () => {
        this.engine.applyGraphicsSettings();
        if (!this.isApplyingAdaptive) {
          this.fpsHistory = [];
          this.lastTierChangeSec = null;
          this.lastTierChangeDir = null;
        }
        if (this.sky) {
          this.sky.sunLight.castShadow = !this.engine.isSoftwareGl && gameState.settings.graphics.shadows;
          this.sky.applyFog(this.engine.scene, this.weather.getWeights());
        }
      }),
      eventBus.on('engine:resized', () => {
        if (this.ready) this.engine.render();
      })
    );
  }

  async init(): Promise<void> {
    this.assets = await loadProceduralAssets(this.engine.renderer);

    const initDate = new Date();
    const initCal = getEdenCalendar(initDate);
    this.appliedEraYear = initCal.eraYear;
    this.appliedSeason = initCal.season;

    this.terrain = new TerrainSystem(gameState.worldSeed, this.assets);
    this.terrain.setEvolution(this.appliedEraYear, this.appliedSeason);
    this.engine.scene.add(this.terrain.group);

    this.sky = new SkySystem(this.engine.scene, this.engine.isSoftwareGl);
    this.sky.setWorldEvolution(this.appliedEraYear, this.appliedSeason, true);
    this.engine.setToneExposureMultiplier(combinedWorldVisuals(this.appliedEraYear, this.appliedSeason).exposureMult);
    this.landmarks = new LandmarkSilhouettes(this.engine.scene);
    this.water = new WaterSystem(this.engine.scene);
    this.lava = new LavaSystem(this.engine.scene, this.terrain, this.assets);
    this.volcano = new VolcanoSystem(this.engine.scene, this.terrain);
    this.weather = new WeatherSystem(this.engine.scene, this.engine.isSoftwareGl);
    this.deathBagView = new DeathBagView(this.engine.scene);
    this.meteors = new MeteorSystem(this.engine.scene);
    this.chunks = new ChunkManager(this.engine.scene, this.terrain, gameState.worldSeed, this.assets, this.spatialHash, this.appliedEraYear);
    this.buildingGhost = new BuildingGhostSystem(this.engine.scene, this.assets.contactShadowTexture);
    this.remotePlayers = new RemotePlayersSystem(this.engine.scene, this.assets.contactShadowTexture);
    this.brukBody = new BrukBody(this.engine.scene, this.spatialHash);
    void this.brukBody.load();
    this.fauna = new FaunaSystem(this.engine.scene, this.spatialHash);
    this.fauna.group.visible = false;

    this.character = createExplorerCharacter(gameState.avatar, this.assets.contactShadowTexture);
    this.character.root.visible = false;
    this.engine.scene.add(this.character.root);

    this.syncPlayerGlbModel();
    this.engine.syncGlowTier();

    this.engine.prewarm();
    this.ready = true;
    this.sky.update(0.016, this.engine.scene, _worldCenter, this.weather.getWeights());
    this.camRig.updateMenuFlyover(0, this.engine.camera);
    this.engine.render();
    this.loop.start();
  }

  private syncPlayerGlbModel(): void {
    if (!this.character) return;
    const url = currentPlayerModelUrl(gameState.avatar.gender);
    if (url === this.loadedGlbUrl && this.glbHandle) return;
    this.loadedGlbUrl = url;
    const seq = ++this.glbLoadSeq;
    if (this.glbHandle) {
      this.character.root.remove(this.glbHandle.root);
      this.glbHandle = null;
    }
    this.character.bodyPivot.visible = true;
    void tryLoadExplorerGlb(url, this.engine.renderer).then((glb) => {
      if (seq !== this.glbLoadSeq || !this.character) return;
      if (!glb) return;
      this.glbHandle = glb;
      this.character.bodyPivot.visible = false;
      this.character.root.add(glb.root);
    });
  }

  enterWorld(resetPlayer: boolean): void {
    if (!this.ready) return;
    const nowMs = sanitizeClockSample(Date.now(), this.lastClockMs);
    this.lastClockMs = nowMs;
    const nowDate = new Date(nowMs);
    const p = gameState.playerPos;
    let sx = resetPlayer ? 0 : p.x;
    let sz = resetPlayer ? 18 : p.z;
    const syaw = resetPlayer ? Math.PI : p.yaw;

    const cal = getEdenCalendar(nowDate);
    this.appliedEdenSeed = effectivePropSeed(gameState.worldSeed, nowDate);
    this.appliedYear = nowDate.getUTCFullYear();
    this.appliedEraYear = getWorldAge(nowDate).eraYear;
    this.appliedSeason = cal.season;
    this.terrain.setAnchors(collectAnchors(gameState.placedStructures));
    this.terrain.setFootprints(collectPlayerFootprints(gameState.placedStructures));
    this.terrain.setEvolution(this.appliedEraYear, this.appliedSeason);
    this.terrain.setSeed(effectiveTerrainSeed(gameState.worldSeed, nowDate));
    this.sky.setWorldEvolution(this.appliedEraYear, this.appliedSeason, true);
    this.engine.setToneExposureMultiplier(combinedWorldVisuals(this.appliedEraYear, this.appliedSeason).exposureMult);
    const waterY = effectiveWaterLevel(WATER_LEVEL, nowDate);
    this.currentWaterLevel = waterY;
    this.water.setLevel(waterY);

    if (!resetPlayer) {
      const reloc = safeRelocateStructures(
        gameState.placedStructures,
        (x, z) => this.terrain.groundHeightAt(x, z),
        waterY
      );
      if (reloc.relocatedCount > 0) {
        this.terrain.setAnchors(collectAnchors(gameState.placedStructures));
        this.terrain.setFootprints(collectPlayerFootprints(gameState.placedStructures));
      }
      const safeP = safeRelocatePlayer(
        { x: sx, y: p.y, z: sz },
        (x, z) => this.terrain.groundHeightAt(x, z),
        waterY
      );
      sx = safeP.x;
      sz = safeP.z;
    }

    this.terrain.updateStreaming(sx, sz, true);
    this.chunks.populate(this.terrain, this.appliedEdenSeed, this.appliedEraYear);
    this.chunks.updateStreaming(this.terrain, sx, sz, true);
    this.chunks.syncPlacedStructures(gameState.placedStructures);

    this.weather.reset(nowMs, this.engine.scene, this.sky);
    this.terrain.setWetness(gameState.wetness);

    this.character.applyAppearance(gameState.avatar);
    this.syncPlayerGlbModel();
    this.character.root.visible = true;

    this.controller.resetTo(sx, sz, syaw, this.terrain);
    this.camRig.snapToPlayer(this.controller.position, 0);
    this.camRig.updateGameplay(0.016, this.engine.camera, this.controller.position, this.terrain, this.spatialHash);
    this.autosaveAccum = 0;
    this.bruk.reset();
    this.brukBody.reset(this.terrain);
    this.fauna.group.visible = true;
    this.fauna.reset(this.appliedEdenSeed, this.appliedEraYear, this.currentWaterLevel, this.terrain, sx, sz);
    multiplayer.enterWorld(effectiveTerrainSeed(gameState.worldSeed, nowDate));
    this.emitHudSnapshot();
    this.engine.render();
  }

  fastTravelTo(x: number, z: number): void {
    if (!this.ready) return;
    this.terrain.updateStreaming(x, z, true);
    this.chunks.updateStreaming(this.terrain, x, z, true);
    this.controller.resetTo(x, z, this.camRig.yaw, this.terrain);
    this.camRig.snapToPlayer(this.controller.position, this.camRig.yaw);
    this.camRig.updateGameplay(0.016, this.engine.camera, this.controller.position, this.terrain, this.spatialHash);
    setScreen('hud');
    this.emitHudSnapshot();
    this.engine.render();
  }

  enterMenuFlyover(): void {
    if (!this.ready) return;
    this.character.root.visible = false;
    this.brukBody.setVisible(false);
    this.fauna.group.visible = false;
    audioSystem.leaveWorld();
    multiplayer.leave();
    this.remotePlayers.clear();
    this.camRig.updateMenuFlyover(0, this.engine.camera);
    this.engine.render();
  }

  respawnAtSafeRidge(): void {
    const R = BALANCE.respawn.vitals;
    const diff = gameState.settings.gameplay.difficulty;
    const death = gameState.playerPos;
    const spot = pickRespawnPoint(death.x, death.z, gameState.placedStructures, (x, z) =>
      this.terrain.groundHeightAt(x, z)
    );
    gameState.vitals = {
      ...gameState.vitals,
      health: R.health,
      stamina: R.stamina,
      temperature: R.temperature,
      oxygen: R.oxygen,
      water: R.water,
      hunger: R.hunger,
      radiation: Math.min(gameState.vitals.radiation, R.radiationCap),
      fatigue: R.fatigue,
      burnTimer: 0,
      woundTimer: 0,
      suffocationTimer: 0,
      filterDurability: 0,
      waterGraceTimer: BALANCE.water.fullGraceSec,
      hungerGraceTimer: BALANCE.hunger.fullGraceSec,
      tempDangerTimer: 0,
      respawnGraceTimer: BALANCE.respawn.protectionSec,
    };
    // Bekal darurat: barang ada di kantong, jadi beri filter agar perjalanan mengambilnya tidak mustahil.
    const emergencyFilters = BALANCE.newPlayer.respawnFilterQty[diff] ?? 0;
    if (emergencyFilters > 0 && !hasItem('gas_filter')) addItem('gas_filter', emergencyFilters);
    this.terrain.updateStreaming(spot.x, spot.z, true);
    this.chunks.updateStreaming(this.terrain, spot.x, spot.z, true);
    this.controller.resetTo(spot.x, spot.z, Math.PI, this.terrain);
    this.camRig.snapToPlayer(this.controller.position, Math.PI);
    setScreen('hud');
    eventBus.emit('toast:show', { text: t('survival.respawnShield'), type: 'info' });
    if (gameState.deathBags.length > 0) {
      eventBus.emit('toast:show', { text: t('survival.bagHint'), type: 'info' });
    }
    this.emitHudSnapshot();
  }

  private confirmBuildPlacement(): void {
    const mode = gameState.buildModeItem;
    if (!mode) return;
    const cand = this.buildingGhost.lastCandidate;
    if (!cand.valid) {
      eventBus.emit('toast:show', { text: t('inventory.missingMaterials'), type: 'warn' });
      return;
    }
    const ok = tryPlaceStructure(mode, this.terrain, this.chunks, cand);
    if (ok) this.animator.triggerInteract('build');
    eventBus.emit('toast:show', {
      text: ok ? t(`items.${mode}.name`) : t('inventory.missingMaterials'),
      type: ok ? 'success' : 'warn',
    });
  }

  private handleGlobalShortcuts(): void {
    const screen = gameState.screen;
    const keys = gameState.settings.controls.keys;
    const canToggleOverlay = ['hud', 'pause', 'inventory', 'map', 'journal'].includes(screen);
    if (!canToggleOverlay) return;

    if (input.consumeJustPressed('F3')) {
      gameState.debugOpen = !gameState.debugOpen;
      this.emitHudSnapshot();
    }

    if (input.consumeJustPressed('Escape') || input.consumeJustPressed('KeyP')) {
      if (screen === 'hud') {
        if (gameState.buildModeItem) {
          gameState.buildModeItem = null;
        } else {
          document.exitPointerLock?.();
          setScreen('pause');
        }
      } else {
        setScreen('hud');
      }
      return;
    }

    const toggleModal = (target: 'inventory' | 'map' | 'journal') => {
      if (screen === 'hud') {
        document.exitPointerLock?.();
        setScreen(target);
      } else if (screen === target) {
        setScreen('hud');
      }
    };

    if (input.consumeJustPressed(keys.inventory) || input.consumeJustPressed('Tab')) toggleModal('inventory');
    if (input.consumeJustPressed(keys.map)) toggleModal('map');
    if (input.consumeJustPressed(keys.journal)) toggleModal('journal');
  }

  private fixedStep(fixedDt: number): void {
    if (!this.ready || gameState.screen !== 'hud') return;

    gameState.playtimeSec += fixedDt;
    const carryW = computeCarryWeight(gameState.inventory);
    const maxW = getMaxCarryWeightIn(gameState.inventory);
    const weightRatio = maxW > 0 ? carryW / maxW : 1;

    const moveRes = this.controller.fixedStep(
      fixedDt,
      this.camRig.yaw,
      this.terrain,
      this.spatialHash,
      weightRatio,
      this.currentWaterLevel
    );
    gameState.distanceExplored += moveRes.distanceMoved;

    const groundY = this.terrain.groundHeightAt(this.controller.position.x, this.controller.position.z);
    const inMeteorDanger = this.meteors.isPlayerInDangerZone(this.controller.position.x, this.controller.position.z);
    this.survival.update(
      fixedDt,
      groundY,
      this.weather.currentWeather,
      this.sky.getTimeOfDay(),
      moveRes.inLava,
      inMeteorDanger,
      this.activeEvent.type,
      {
        rainWeight: this.weather.getRainWeight(),
        windStrength: this.weather.getWind().strength,
        inWater: moveRes.inWater,
        immersed: moveRes.swimming,
        eraYear: this.appliedEraYear,
        waterLevel: this.currentWaterLevel,
      }
    );
    this.survival.updateCleanAir(
      fixedDt,
      (x, z) => this.terrain.groundHeightAt(x, z),
      this.weather.currentWeather
    );
    this.geyserCoordBuf.length = 0;
    if (
      gameState.vitals.temperature <= BALANCE.temperature.coldWarnBannerC &&
      !this.survival.inShelter &&
      !this.survival.nearCampfire
    ) {
      let idx = 0;
      for (const item of this.chunks.interactables) {
        if (item.depleted || item.kind !== 'geyser_pool') continue;
        let slot = this.geyserCoordPool[idx];
        if (!slot) {
          slot = { x: 0, z: 0 };
          this.geyserCoordPool.push(slot);
        }
        slot.x = item.x;
        slot.z = item.z;
        this.geyserCoordBuf.push(slot);
        idx++;
      }
    }
    this.survival.updateHeatSource(fixedDt, this.geyserCoordBuf);
    tickStructures(fixedDt, this.weather.currentWeather);
    this.bruk.update(fixedDt, this.weather.currentWeather, this.brukBody.getWorldPos());
  }

  private renderFrame(alpha: number, dt: number, elapsed: number): void {
    if (!this.ready) return;
    this.handleGlobalShortcuts();

    const screen = gameState.screen;
    const isPlaying = screen === 'hud';
    const isFlyover = ['menu', 'splash', 'onboarding', 'newGame', 'auth', 'credits'].includes(screen);

    if (isFlyover) {
      this.sky.update(dt * 0.4, this.engine.scene, _worldCenter, this.weather.getWeights());
      this.landmarks.update(_worldCenter, this.sky.horizonColor);
      this.water.update(dt, _worldCenter);
      this.lava.update(dt, elapsed);
      this.volcano.update(dt, gameState.settings.graphics.particles, undefined, undefined, 1, this.weather.getWind());
      this.camRig.updateMenuFlyover(elapsed, this.engine.camera);
    } else if (isPlaying) {
      this.fpsAccum += dt;
      this.fpsSamples++;
      if (this.fpsAccum >= 1.0) {
        this.currentFps = Math.round(this.fpsSamples / this.fpsAccum);
        this.adaptiveTimeSec += this.fpsAccum;
        this.fpsSamples = 0;
        this.fpsAccum = 0;
        this.checkAdaptiveQuality();
      }

      this.handlePlayingActions();

      const pos = this.controller.position;
      this.terrain.updateStreaming(pos.x, pos.z);
      this.chunks.updateStreaming(this.terrain, pos.x, pos.z);

      // Peta mengikuti kalender nyata: cek pergantian hari/bulan/tahun tiap ~30 dtk
      this.edenCheckTimer += dt;
      if (this.edenCheckTimer > 30) {
        this.edenCheckTimer = 0;
        const safeNowMs = sanitizeClockSample(Date.now(), this.lastClockMs);
        this.lastClockMs = safeNowMs;
        const nowDate = new Date(safeNowMs);
        const warn = shiftWarning(safeNowMs);
        if (warn.level !== 'none' && warn.key !== this.shiftWarnKey) {
          this.shiftWarnKey = warn.key;
          const hasAnchor = gameState.placedStructures.some((x) => x.type === 'terrain_anchor');
          const prefix = warn.kind === 'year' ? 'Zaman Baru' : 'Pergeseran Besar';
          eventBus.emit('toast:show', {
            text: `${prefix} dalam ${formatShiftCountdown(warn.msLeft)}: medan berganti.${hasAnchor ? '' : ' Pasang Jangkar Medan untuk melindungi base.'}`,
            type: warn.level === 'imminent' ? 'warn' : 'info',
          });
        }
        const next = effectivePropSeed(gameState.worldSeed, nowDate);
        if (next !== this.appliedEdenSeed) {
          this.appliedEdenSeed = next;
          const nextCal = getEdenCalendar(nowDate);
          const newAge = getWorldAge(nowDate);
          const eraChanged = nowDate.getUTCFullYear() !== this.appliedYear;
          const seasonChanged = nextCal.season !== this.appliedSeason;
          if (eraChanged) {
            this.appliedYear = nowDate.getUTCFullYear();
            this.appliedEraYear = newAge.eraYear;
          }
          if (seasonChanged) {
            this.appliedSeason = nextCal.season;
          }
          this.sky.setWorldEvolution(this.appliedEraYear, this.appliedSeason);
          this.engine.setToneExposureMultiplier(combinedWorldVisuals(this.appliedEraYear, this.appliedSeason).exposureMult);
          const waterY = effectiveWaterLevel(WATER_LEVEL, nowDate);
          this.currentWaterLevel = waterY;
          this.water.setLevel(waterY);
          this.terrain.setAnchors(collectAnchors(gameState.placedStructures));
          this.terrain.setFootprints(collectPlayerFootprints(gameState.placedStructures));
          this.terrain.setEvolution(this.appliedEraYear, this.appliedSeason);
          this.terrain.setSeed(effectiveTerrainSeed(gameState.worldSeed, nowDate));
          safeRelocateStructures(
            gameState.placedStructures,
            (x, z) => this.terrain.groundHeightAt(x, z),
            waterY
          );
          const safeP = safeRelocatePlayer(
            { x: pos.x, y: pos.y, z: pos.z },
            (x, z) => this.terrain.groundHeightAt(x, z),
            waterY
          );
          if (safeP.relocated) {
            this.controller.resetTo(safeP.x, safeP.z, this.controller.yaw, this.terrain);
          }
          this.chunks.populate(this.terrain, next, this.appliedEraYear);
          this.chunks.syncPlacedStructures(gameState.placedStructures);
          if (eraChanged) {
            eventBus.emit('era:achieved', { id: `era_${newAge.eraYear}`, eraYear: newAge.eraYear });
            eventBus.emit('toast:show', { text: `⏳ ${newAge.name} (Tahun ${newAge.eraYear}) dimulai!`, type: 'info' });
          } else {
            eventBus.emit('toast:show', { text: 'Hari baru: peta berubah mengikuti waktu dunia nyata.', type: 'info' });
          }
        }
      }
      this.activeEvent = this.worldEvents.update(dt, this.weather.currentWeather);
      this.biomeTimer -= dt;
      if (this.biomeTimer <= 0) {
        this.biomeTimer = 0.5;
        this.sky.setBiome(getBiomeAt(pos.x, pos.z, this.terrain.groundHeightAt(pos.x, pos.z)).id);
        const region = getRegionAt(pos.x, pos.z);
        if (region.key !== this.lastRegionKey) {
          const nowMs = performance.now();
          if (this.lastRegionKey && nowMs - this.lastRegionToastMs > 15000) {
            this.lastRegionToastMs = nowMs;
            eventBus.emit('toast:show', {
              text: `${t('regions.entered')} ${regionLabel(region, t)} · ${t('regions.danger')} ${dangerLevel(region.tier)}/5`,
              type: region.tier >= 3 ? 'warn' : 'info',
            });
          }
          this.lastRegionKey = region.key;
        }
      }
      this.weather.update(dt, this.engine.scene, this.sky, pos, this.terrain);
      this.terrain.setWetness(gameState.wetness);
      this.sky.update(dt, this.engine.scene, pos, this.weather.getWeights());
      this.landmarks.update(pos, this.sky.horizonColor);
      this.water.update(dt, pos);
      this.lava.update(dt, elapsed);
      this.volcano.update(
        dt,
        gameState.settings.graphics.particles,
        pos,
        this.terrain,
        getWorldAge().volcanoMult,
        this.weather.getWind()
      );
      this.deathBagView.update(elapsed, (x, z) => this.terrain.groundHeightAt(x, z));

      const swarmMult = this.activeEvent.type === 'meteor_swarm' ? 2.8 : 1;
      const meteorMinDist = isSafeStartActive(gameState.settings.gameplay.difficulty, gameState.playtimeSec)
        ? BALANCE.safeStart.minMeteorDistM
        : 10;
      this.meteors.update(
        dt,
        this.weather.currentWeather,
        this.terrain,
        pos,
        (x, y, z, pDist) => {
          this.camRig.addTrauma(Math.max(0.15, 0.85 - pDist * 0.02));
          audioSystem.scheduleMeteor(pDist, x, y, z);
          this.brukBody.notifyDisturbance(x, z, true);
          this.survival.applyMeteorHit(pDist);
          if (Math.random() < 0.7 && y > WATER_LEVEL) {
            this.chunks.spawnMeteorCrystal(x, y, z);
          }
        },
        swarmMult,
        meteorMinDist
      );

      const nearest = this.chunks.findNearestInteractable(pos.x, pos.z);
      const lookAtYaw = nearest
        ? Math.atan2(nearest.x - pos.x, nearest.z - pos.z) - this.controller.yaw
        : 0;
      const showVapor = this.survival.currentHazard === 'toxic' || gameState.vitals.temperature < 35.8;

      this.controller.renderUpdate(
        alpha,
        dt,
        elapsed,
        this.character,
        this.animator,
        showVapor,
        lookAtYaw,
        this.glbHandle
      );
      this.character.setEquipmentVisuals(getBestMiningToolId(), hasItem('heat_shield'));
      this.character.setSootAmount(gameState.sootLevel);
      this.camRig.updateGameplay(dt, this.engine.camera, pos, this.terrain, this.spatialHash);
      this.buildingGhost.update(this.terrain);
      const ww = this.weather.getWeights();
      const stormW = Math.min(1, ww.ash_storm + ww.acid_rain + ww.electrical_storm + ww.meteor_shower);
      const todNow = this.sky.getTimeOfDay();
      const isNightNow = todNow < 0.18 || todNow > 0.78;
      this.brukBody.update(dt, elapsed, {
        playerX: pos.x,
        playerZ: pos.z,
        camera: this.engine.camera,
        weather: this.weather.currentWeather,
        stormWeight: stormW,
        isNight: isNightNow,
        lowGfx: gameState.settings.graphics.preset === 'low',
        onPlayerPush: (nx, nz) => {
          this.controller.position.x = nx;
          this.controller.position.z = nz;
          gameState.playerPos.x = nx;
          gameState.playerPos.z = nz;
        },
      });
      this.fauna.update(
        dt,
        this.terrain,
        this.engine.camera,
        pos.x,
        pos.z,
        this.appliedEdenSeed || gameState.worldSeed,
        this.appliedEraYear,
        this.currentWaterLevel,
        gameState.settings.graphics.preset === 'low'
      );

      if (this.lastBiomeSound !== this.survival.currentBiomeId) {
        this.lastBiomeSound = this.survival.currentBiomeId;
        audioSystem.setBiomeAmbience(this.survival.currentBiomeId);
      }

      this.engine.camera.getWorldPosition(_camPos);
      this.engine.camera.getWorldDirection(_camFwd);
      _camUp.set(0, 1, 0).applyQuaternion(this.engine.camera.quaternion);
      audioSystem.updateListener(
        _camPos.x,
        _camPos.y,
        _camPos.z,
        _camFwd.x,
        _camFwd.y,
        _camFwd.z,
        _camUp.x,
        _camUp.y,
        _camUp.z
      );

      const tod = this.sky.getTimeOfDay();
      audioSystem.setEnvironmentState({
        inShelter: this.survival.inShelter,
        swimming: this.controller.swimming,
        isNight: tod < 0.18 || tod > 0.78,
        nearWater: this.survival.nearWater,
        surface: this.survival.currentSurface,
        hazard: this.survival.currentHazard,
        activeEvent: this.activeEvent.type,
        inMeteorDanger: this.meteors.isPlayerInDangerZone(pos.x, pos.z),
      });

      this.audioSpatialAccum += dt;
      if (this.audioSpatialAccum >= 0.2) {
        this.audioSpatialAccum = 0;
        this.refreshSpatialAudioSources(_camPos.x, _camPos.y, _camPos.z, pos.x, pos.z);
      }
      audioSystem.updateAmbient(dt, this.weather.getWeights(), this.survival.currentBiomeId, this.weather.getWind().strength);

      this.autosaveAccum += dt;
      if (this.autosaveAccum >= AUTOSAVE_INTERVAL_SEC) {
        this.autosaveAccum = 0;
        saveGame(true);
      }

      this.hudEmitAccum += dt;
      const emitInterval = gameState.debugOpen ? 0.05 : 0.1;
      if (this.hudEmitAccum >= emitInterval) {
        this.hudEmitAccum = 0;
        this.emitHudSnapshot();
      }
    }

    if (['hud', 'pause', 'inventory', 'map', 'journal', 'storage'].includes(screen)) {
      const cp = this.controller.position;
      const sp = this.controller.lastHorizontalSpeed;
      const anim: AnimState = this.controller.swimming
        ? 'swim'
        : !this.controller.grounded
          ? 'jump'
          : sp > 6.8
            ? 'run'
            : sp > 0.35
              ? 'walk'
              : 'idle';
      multiplayer.tick({ x: cp.x, y: cp.y, z: cp.z, yaw: this.controller.yaw, anim, speed: sp });
      this.remotePlayers.update(dt, elapsed, multiplayer.getRemotePlayers(), cp);
    }

    input.endFrame();
    this.engine.render();
  }

  private handlePlayingActions(): void {
    const keys = gameState.settings.controls.keys;
    for (let i = 0; i < 6; i++) {
      if (input.consumeJustPressed(`Digit${i + 1}`)) useHotbarSlot(i);
    }

    if (input.consumeJustPressed('KeyR') && gameState.buildModeItem) {
      gameState.buildRotOffset += Math.PI / 2;
    }

    if (input.consumeJustPressed(keys.build)) {
      if (gameState.buildModeItem) {
        this.confirmBuildPlacement();
      } else if (hasItem('basic_shelter')) {
        gameState.buildModeItem = 'basic_shelter';
      } else {
        eventBus.emit('toast:show', { text: t('inventory.missingMaterials'), type: 'warn' });
      }
    }

    if (input.consumeJustPressed(keys.interact)) {
      if (gameState.buildModeItem) {
        this.confirmBuildPlacement();
      } else {
        const px = this.controller.position.x;
        const pz = this.controller.position.z;
        const bag = findBagInRange(gameState.deathBags, px, pz);
        const nearest = bag ? null : this.chunks.findNearestInteractable(px, pz);
        const canTalkBruk = !bag && this.brukBody.isTalkable(px, pz, this.controller.yaw);
        const brukPos = this.brukBody.getWorldPos();
        const preferWorldObj =
          Boolean(nearest) &&
          (!canTalkBruk || distance2D(px, pz, nearest!.x, nearest!.z) < distance2D(px, pz, brukPos.x, brukPos.z) - 0.5);

        if (bag) {
          this.animator.triggerInteract('gather');
          const all = pickUpBag(bag.id);
          audioSystem.playSfx('gather');
          eventBus.emit('toast:show', {
            text: t(all ? 'survival.bagRecovered' : 'survival.bagPartial'),
            type: all ? 'success' : 'warn',
          });
        } else if (canTalkBruk && !preferWorldObj) {
          const todNow = this.sky.getTimeOfDay();
          this.bruk.talk({
            isNight: todNow < 0.18 || todNow > 0.78,
            weather: this.weather.currentWeather,
          });
          this.brukBody.notifyTalk();
        } else if (nearest) {
          this.animator.triggerInteract(actionKindFor(nearest.kind, Boolean(getBestMiningToolId())));
          performInteraction(nearest, this.chunks, this.sky);
        }
      }
    }
  }

  private checkAdaptiveQuality(): void {
    if (this.engine.isSoftwareGl) return;
    const gfx = gameState.settings.graphics;
    const mode = gfx.mode ?? gfx.preset;
    if (mode !== 'auto') return;

    this.fpsHistory = recordFpsSample(this.fpsHistory, this.currentFps, this.adaptiveTimeSec);
    const currentTier = gfx.preset;
    const nextTier = decideGraphicsTier({
      samples: this.fpsHistory,
      currentTier,
      timeSec: this.adaptiveTimeSec,
      lastChangeTimeSec: this.lastTierChangeSec,
      lastChangeDirection: this.lastTierChangeDir,
    });

    if (nextTier !== currentTier) {
      const dir: TierTransitionDirection = tierRank(nextTier) < tierRank(currentTier) ? 'down' : 'up';
      this.lastTierChangeSec = this.adaptiveTimeSec;
      this.lastTierChangeDir = dir;
      this.isApplyingAdaptive = true;
      try {
        saveSettingsToLocal({
          ...gameState.settings,
          graphics: {
            ...gfx,
            mode: 'auto',
            preset: nextTier,
            shadows: nextTier !== 'low',
            particles: nextTier !== 'low',
            volumetricFog: nextTier !== 'low',
            viewDistance: nextTier === 'low' ? 85 : nextTier === 'medium' ? 125 : 175,
          },
        });
      } finally {
        this.isApplyingAdaptive = false;
      }
      eventBus.emit('toast:show', {
        text: t(dir === 'down' ? 'settings.adaptiveDown' : 'settings.adaptiveUp'),
        type: 'info',
      });
    }
  }

  private emitHudSnapshot(): void {
    const p = this.controller.position;
    const groundY = this.terrain.groundHeightAt(p.x, p.z);
    const biome = getBiomeAt(p.x, p.z, groundY);
    const nearest = this.chunks.findNearestInteractable(p.x, p.z);
    const quest = evaluateQuests(biome.id);
    const headingRad = ((-this.camRig.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const headingDeg = Math.round((headingRad * 180) / Math.PI);

    const minimapNodes: HudSnapshot['minimapNodes'] = [
      { x: VOLCANO_MAIN.x, z: VOLCANO_MAIN.z, kind: 'volcano' },
    ];
    for (const item of this.chunks.interactables) {
      if (item.depleted) continue;
      if (['water', 'geyser_pool', 'crystal', 'shelter', 'fast_beacon'].includes(item.kind)) {
        const mapped =
          item.kind === 'geyser_pool' ? 'geyser' : item.kind === 'fast_beacon' ? 'beacon' : item.kind;
        minimapNodes.push({ x: item.x, z: item.z, kind: mapped as HudSnapshot['minimapNodes'][number]['kind'] });
      }
    }

    for (const rp of multiplayer.getRemotePlayers()) {
      minimapNodes.push({ x: rp.x, z: rp.z, kind: 'player' });
    }

    const bagNear = findBagInRange(gameState.deathBags, p.x, p.z);
    let nearestBag: HudSnapshot['deathBag'] = null;
    for (const b of gameState.deathBags) {
      const d = distance2D(p.x, p.z, b.x, b.z);
      if (d <= BALANCE.deathBag.hudDistanceMaxM && (!nearestBag || d < nearestBag.dist)) {
        nearestBag = { dist: Math.round(d), relDeg: relativeBearingDeg(p.x, p.z, b.x, b.z, headingRad) };
      }
    }
    let wpInfo: HudSnapshot['waypoint'] = null;
    const wp = gameState.customWaypoints[0];
    if (wp) {
      const wd = distance2D(p.x, p.z, wp.x, wp.z);
      if (wd < 12) {
        gameState.customWaypoints = [];
        eventBus.emit('toast:show', { text: t('map.waypointReached'), type: 'success' });
      } else {
        wpInfo = { dist: Math.round(wd), relDeg: relativeBearingDeg(p.x, p.z, wp.x, wp.z, headingRad) };
      }
    }
    const ca = this.survival.cleanAir;
    const hs = this.survival.heatSource;
    const guide = pickQuestGuide(quest.activeQuestId, p.x, p.z, minimapNodes);

    const snap: HudSnapshot = {
      vitals: { ...gameState.vitals },
      headingDeg,
      playerX: p.x,
      playerY: p.y,
      playerZ: p.z,
      timeOfDay: this.sky.getTimeOfDay(),
      weather: this.weather.currentWeather,
      hazard: this.survival.currentHazard,
      biomeId: biome.id,
      activeEvent: this.activeEvent,
      interactTarget: (() => {
        if (bagNear) return { id: bagNear.id, actionKey: 'pickup_bag' };
        const canTalkBruk = this.brukBody.isTalkable(p.x, p.z, this.controller.yaw);
        const brukPos = this.brukBody.getWorldPos();
        const preferWorldObj =
          Boolean(nearest) &&
          (!canTalkBruk || distance2D(p.x, p.z, nearest!.x, nearest!.z) < distance2D(p.x, p.z, brukPos.x, brukPos.z) - 0.5);
        if (canTalkBruk && !preferWorldObj) return { id: 'bruk_npc', actionKey: 'talk_bruk' };
        return nearest ? { id: nearest.id, actionKey: nearest.actionKey } : null;
      })(),
      activeQuestId: quest.activeQuestId,
      questProgressText: quest.progressText,
      questsCompletedCount: gameState.completedQuests.length,
      questsTotalCount: quest.totalCount,
      hotbar: getHotbarSlots(),
      selectedHotbarIdx: gameState.selectedHotbarIdx,
      equippedToolId: getBestMiningToolId(),
      carryWeight: computeCarryWeight(gameState.inventory),
      maxCarryWeight: getMaxCarryWeightIn(gameState.inventory),
      buildModeItem: gameState.buildModeItem,
      buildValid: this.buildingGhost.lastCandidate.valid,
      distanceExplored: Math.round(gameState.distanceExplored),
      playtimeSec: Math.round(gameState.playtimeSec),
      tutorialHintKey: evaluateContextualTutorial(this.survival.currentHazard, this.survival.nearWater),
      minimapNodes,
      online: multiplayer.getHudInfo(),
      cleanAir: ca
        ? {
            dist: Math.round(ca.dist),
            relDeg: relativeBearingDeg(p.x, p.z, ca.x, ca.z, headingRad),
            kind: ca.kind,
          }
        : null,
      heatSource: hs
        ? {
            dist: Math.round(hs.dist),
            relDeg: relativeBearingDeg(p.x, p.z, hs.x, hs.z, headingRad),
            kind: hs.kind,
          }
        : null,
      deathBag: nearestBag,
      waypoint: wpInfo,
      questGuide: guide
        ? { kind: guide.kind, dist: Math.round(guide.dist), relDeg: relativeBearingDeg(p.x, p.z, guide.x, guide.z, headingRad) }
        : null,
      eraYear: this.appliedEraYear,
      hungerActive: BALANCE.survival.switches.hunger && this.appliedEraYear >= BALANCE.hunger.startsAtEra,
      statusCues: {
        wet:
          BALANCE.survival.switches.wetness &&
          (gameState.wetness >= BALANCE.wetness.hudWetThreshold || this.controller.inWater),
        immersed: BALANCE.survival.switches.wetness && this.controller.swimming,
        cold: gameState.vitals.temperature <= BALANCE.temperature.coldWarnC,
        windy:
          BALANCE.survival.switches.wind &&
          !this.survival.inShelter &&
          this.weather.getWind().strength >= BALANCE.wind.hudWindySpeedThreshold,
        falling: isFallingFast(this.controller.grounded, this.controller.swimming, this.controller.velocity.y),
      },
      debug: (() => {
        const fTel = this.fauna.getTelemetry();
        return {
          fps: this.currentFps,
          activeChunks: this.terrain.getActiveChunkCount(),
          pendingChunks: this.terrain.getPendingChunkCount(),
          drawCalls: this.engine.renderStats.calls,
          triangles: this.engine.renderStats.triangles,
          graphicsTier: this.engine.getActiveTier(),
          graphicsMode: gameState.settings.graphics.mode ?? gameState.settings.graphics.preset,
          renderTargetSize: this.engine.renderStats.renderTargetSize,
          playerX: p.x,
          playerY: p.y,
          playerZ: p.z,
          biomeId: biome.id,
          hazard: this.survival.currentHazard,
          wetness: gameState.wetness,
          windSpeed: this.weather.getWind().strength,
          weatherBlend: this.weather.getBlendSummary(),
          faunaCount: fTel.activeCount,
          faunaBuckets: fTel.bucketsSummary,
          faunaAiMs: fTel.aiMs,
        };
      })(),
    };

    gameState.lastHudSnapshot = snap;
    eventBus.emit('hud:update', snap);
  }

  private refreshSpatialAudioSources(lx: number, ly: number, lz: number, px: number, pz: number): void {
    this.spatialSrcBuf.length = 0;

    // 1. Lava (nearest point on lava river or Mount Hadean crater pool)
    const rz = Math.max(-44, Math.min(24, pz));
    const rx = getLavaRiverCenterX(rz);
    const ry = Math.min(this.terrain.groundHeightAt(rx, rz), -0.4);
    const dRiver = Math.hypot(rx - lx, ry - ly, rz - lz);
    const dCrater = Math.hypot(VOLCANO_MAIN.x - lx, 12.2 - ly, VOLCANO_MAIN.z - lz);
    if (dCrater < dRiver) {
      this.spatialSlotLava.x = VOLCANO_MAIN.x;
      this.spatialSlotLava.y = 12.2;
      this.spatialSlotLava.z = VOLCANO_MAIN.z;
      this.spatialSlotLava.distance = dCrater;
    } else {
      this.spatialSlotLava.x = rx;
      this.spatialSlotLava.y = ry;
      this.spatialSlotLava.z = rz;
      this.spatialSlotLava.distance = dRiver;
    }
    this.spatialSrcBuf.push(this.spatialSlotLava);

    // 2. Nearest geyser pool or water source from active chunks (+ geyser POI fallback)
    let bestGeyserDist = Infinity;
    let bestGeyserX = 0;
    let bestGeyserY = 0;
    let bestGeyserZ = 0;
    let bestWaterDist = Infinity;
    let bestWaterX = 0;
    let bestWaterY = WATER_LEVEL;
    let bestWaterZ = 0;

    for (const item of this.chunks.interactables) {
      if (item.depleted) continue;
      if (item.kind === 'geyser_pool') {
        const d = Math.hypot(item.x - lx, item.y - ly, item.z - lz);
        if (d < bestGeyserDist) {
          bestGeyserDist = d;
          bestGeyserX = item.x;
          bestGeyserY = item.y;
          bestGeyserZ = item.z;
        }
      } else if (item.kind === 'water') {
        const d = Math.hypot(item.x - lx, item.y - ly, item.z - lz);
        if (d < bestWaterDist) {
          bestWaterDist = d;
          bestWaterX = item.x;
          bestWaterY = item.y;
          bestWaterZ = item.z;
        }
      }
    }
    if (!Number.isFinite(bestGeyserDist)) {
      for (const poi of WORLD_POIS) {
        if (poi.kind !== 'geyser' && poi.kind !== 'hot_spring') continue;
        const d = Math.hypot(poi.x - lx, 0 - ly, poi.z - lz);
        if (d < bestGeyserDist) {
          bestGeyserDist = d;
          bestGeyserX = poi.x;
          bestGeyserY = this.terrain.groundHeightAt(poi.x, poi.z);
          bestGeyserZ = poi.z;
        }
      }
    }
    if (Number.isFinite(bestGeyserDist)) {
      this.spatialSlotGeyser.x = bestGeyserX;
      this.spatialSlotGeyser.y = bestGeyserY;
      this.spatialSlotGeyser.z = bestGeyserZ;
      this.spatialSlotGeyser.distance = bestGeyserDist;
      this.spatialSrcBuf.push(this.spatialSlotGeyser);
    }

    if (this.survival.nearWater) {
      const shoreDist = Math.hypot(px - lx, WATER_LEVEL - ly, pz - lz);
      if (shoreDist < bestWaterDist) {
        bestWaterDist = shoreDist;
        bestWaterX = px;
        bestWaterY = WATER_LEVEL;
        bestWaterZ = pz;
      }
    }
    if (Number.isFinite(bestWaterDist)) {
      this.spatialSlotWater.x = bestWaterX;
      this.spatialSlotWater.y = bestWaterY;
      this.spatialSlotWater.z = bestWaterZ;
      this.spatialSlotWater.distance = bestWaterDist;
      this.spatialSrcBuf.push(this.spatialSlotWater);
    }

    // 3. Nearest campfire
    let bestCampDist = Infinity;
    let bestCampX = 0;
    let bestCampY = 0;
    let bestCampZ = 0;
    for (const s of gameState.placedStructures) {
      if (s.type !== 'campfire_kit') continue;
      const d = Math.hypot(s.x - lx, s.y - ly, s.z - lz);
      if (d < bestCampDist) {
        bestCampDist = d;
        bestCampX = s.x;
        bestCampY = s.y + 0.4;
        bestCampZ = s.z;
      }
    }
    if (Number.isFinite(bestCampDist)) {
      this.spatialSlotCampfire.x = bestCampX;
      this.spatialSlotCampfire.y = bestCampY;
      this.spatialSlotCampfire.z = bestCampZ;
      this.spatialSlotCampfire.distance = bestCampDist;
      this.spatialSrcBuf.push(this.spatialSlotCampfire);
    }

    audioSystem.setSpatialSources(this.spatialSrcBuf);
  }

  dispose(): void {
    this.loop.dispose();
    input.detach();
    this.unsubs.forEach((u) => u());
    audioSystem.dispose();
    this.terrain?.dispose();
    this.sky?.dispose();
    this.landmarks?.dispose();
    this.water?.dispose();
    this.lava?.dispose();
    this.volcano?.dispose();
    this.weather?.dispose();
    this.deathBagView?.dispose();
    this.meteors?.dispose();
    this.buildingGhost?.dispose();
    multiplayer.leave();
    this.remotePlayers?.dispose();
    this.brukBody?.dispose();
    this.fauna?.dispose();
    this.chunks?.dispose();
    this.engine.dispose();
  }
}
