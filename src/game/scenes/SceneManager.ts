import * as THREE from 'three';
import { AUTOSAVE_INTERVAL_SEC, WATER_LEVEL } from '../config';
import { Engine } from '../core/engine';
import { GameLoop } from '../core/loop';
import { input } from '../core/input';
import { loadProceduralAssets, type ProceduralAssets } from '../core/assetLoader';
import { SpatialHashGrid } from '../core/spatialHash';
import { gameState, saveSettingsToLocal, setScreen, type HudSnapshot, type StructureType } from '../core/state';
import { eventBus } from '../core/eventBus';
import { TerrainSystem } from '../world/terrain';
import { SkySystem } from '../world/sky';
import { WaterSystem } from '../world/water';
import { LavaSystem } from '../world/lava';
import { VolcanoSystem } from '../world/volcano';
import { WeatherSystem } from '../world/weather';
import { MeteorSystem } from '../world/meteors';
import { ChunkManager } from '../world/chunkManager';
import { RemotePlayersSystem } from '../world/remotePlayers';
import { multiplayer } from '../net/multiplayer';
import type { AnimState } from '../net/multiplayerProtocol';
import { VOLCANO_MAIN, getBiomeAt } from '../world/biomes';
import { createExplorerCharacter, type CharacterRig } from '../player/character';
import { tryLoadExplorerGlb, type GlbExplorerHandle } from '../player/glbCharacter';
import { CharacterAnimator } from '../player/animator';
import { PlayerController } from '../player/controller';
import { ThirdPersonCamera } from '../player/camera';
import { SurvivalSystem } from '../systems/survival';
import { performInteraction } from '../systems/interaction';
import { BuildingGhostSystem, tickStructures, tryPlaceStructure } from '../systems/building';
import { WorldEventSystem, evaluateContextualTutorial } from '../systems/events';
import { evaluateQuests } from '../systems/quests';
import {
  computeCarryWeight,
  getBestMiningToolId,
  getHotbarSlots,
  getMaxCarryWeightIn,
  hasItem,
  useHotbarSlot,
} from '../systems/inventory';
import { saveGameToSlot } from '../systems/saveLoad';
import { audioSystem } from '../systems/audio';
import { t } from '../utils/i18n';

const _worldCenter = new THREE.Vector3(0, 0, 0);

export class SceneManager {
  private engine: Engine;
  private loop: GameLoop;
  private spatialHash = new SpatialHashGrid(8);
  private assets!: ProceduralAssets;
  private terrain!: TerrainSystem;
  private sky!: SkySystem;
  private water!: WaterSystem;
  private lava!: LavaSystem;
  private volcano!: VolcanoSystem;
  private weather!: WeatherSystem;
  private meteors!: MeteorSystem;
  private chunks!: ChunkManager;
  private remotePlayers!: RemotePlayersSystem;
  private buildingGhost!: BuildingGhostSystem;
  private character!: CharacterRig;
  private glbHandle: GlbExplorerHandle | null = null;
  private animator = new CharacterAnimator();
  private controller: PlayerController;
  private camRig = new ThirdPersonCamera();
  private survival = new SurvivalSystem();
  private worldEvents = new WorldEventSystem();

  private activeEvent: HudSnapshot['activeEvent'] = { type: 'none', remainingSec: 0 };
  private hudEmitAccum = 0;
  private autosaveAccum = 0;
  private fpsSamples = 0;
  private fpsAccum = 0;
  private lowFpsTimer = 0;
  private currentFps = 60;
  private lastBiomeSound = '';
  private ready = false;
  private unsubs: Array<() => void> = [];

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    input.attach(this.engine.renderer.domElement);

    this.controller = new PlayerController({
      onJump: () => {
        this.animator.triggerJump();
        audioSystem.playSfx('jump');
      },
      onLand: () => this.animator.triggerLand(),
      onFootstep: () => audioSystem.playFootstep(this.survival.currentSurface),
    });

    this.loop = new GameLoop(this.engine.renderer, {
      onFixedStep: (dt) => this.fixedStep(dt),
      onRender: (alpha, dt, elapsed) => this.renderFrame(alpha, dt, elapsed),
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
        audioSystem.playSfx('thunder');
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
        if (this.sky) {
          this.sky.sunLight.castShadow = !this.engine.isSoftwareGl && gameState.settings.graphics.shadows;
          this.sky.applyFog(this.engine.scene, this.weather.currentWeather);
        }
      }),
      eventBus.on('engine:resized', () => {
        if (this.ready) this.engine.render();
      })
    );
  }

  async init(): Promise<void> {
    this.assets = await loadProceduralAssets(this.engine.renderer);

    this.terrain = new TerrainSystem(gameState.worldSeed, this.assets);
    this.engine.scene.add(this.terrain.group);

    this.sky = new SkySystem(this.engine.scene, this.engine.isSoftwareGl);
    this.water = new WaterSystem(this.engine.scene);
    this.lava = new LavaSystem(this.engine.scene, this.terrain, this.assets);
    this.volcano = new VolcanoSystem(this.engine.scene, this.terrain);
    this.weather = new WeatherSystem(this.engine.scene);
    this.meteors = new MeteorSystem(this.engine.scene);
    this.chunks = new ChunkManager(this.engine.scene, this.terrain, gameState.worldSeed, this.assets, this.spatialHash);
    this.buildingGhost = new BuildingGhostSystem(this.engine.scene, this.assets.contactShadowTexture);
    this.remotePlayers = new RemotePlayersSystem(this.engine.scene, this.assets.contactShadowTexture);

    this.character = createExplorerCharacter(gameState.avatar, this.assets.contactShadowTexture);
    this.character.root.visible = false;
    this.engine.scene.add(this.character.root);

    void tryLoadExplorerGlb('./models/explorer.glb').then((glb) => {
      if (!glb || !this.character) return;
      this.glbHandle = glb;
      this.character.bodyPivot.visible = false;
      this.character.root.add(glb.root);
    });

    this.engine.prewarm();
    this.ready = true;
    this.sky.update(0.016, this.engine.scene, _worldCenter, this.weather.currentWeather);
    this.camRig.updateMenuFlyover(0, this.engine.camera);
    this.engine.render();
    this.loop.start();
  }

  enterWorld(resetPlayer: boolean): void {
    if (!this.ready) return;
    const p = gameState.playerPos;
    const sx = resetPlayer ? 0 : p.x;
    const sz = resetPlayer ? 18 : p.z;
    const syaw = resetPlayer ? Math.PI : p.yaw;

    this.terrain.setSeed(gameState.worldSeed);
    this.terrain.updateStreaming(sx, sz, true);
    this.chunks.populate(this.terrain, gameState.worldSeed);
    this.chunks.updateStreaming(this.terrain, sx, sz, true);
    this.chunks.syncPlacedStructures(gameState.placedStructures);

    this.character.applyAppearance(gameState.avatar);
    this.character.root.visible = true;

    this.controller.resetTo(sx, sz, syaw, this.terrain);
    this.camRig.snapToPlayer(this.controller.position, 0);
    this.camRig.updateGameplay(0.016, this.engine.camera, this.controller.position, this.terrain, this.spatialHash);
    this.autosaveAccum = 0;
    multiplayer.enterWorld(gameState.worldSeed);
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
    multiplayer.leave();
    this.remotePlayers.clear();
    this.camRig.updateMenuFlyover(0, this.engine.camera);
    this.engine.render();
  }

  respawnAtSafeRidge(): void {
    gameState.vitals = {
      ...gameState.vitals,
      health: 100,
      stamina: 100,
      temperature: 37.0,
      oxygen: 100,
      water: 85,
      radiation: Math.min(gameState.vitals.radiation, 20),
      fatigue: 100,
      burnTimer: 0,
      woundTimer: 0,
    };
    this.terrain.updateStreaming(0, 18, true);
    this.chunks.updateStreaming(this.terrain, 0, 18, true);
    this.controller.resetTo(0, 18, Math.PI, this.terrain);
    this.camRig.snapToPlayer(this.controller.position, Math.PI);
    setScreen('hud');
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
      weightRatio
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
      this.activeEvent.type
    );
    tickStructures(fixedDt, this.weather.currentWeather);
  }

  private renderFrame(alpha: number, dt: number, elapsed: number): void {
    if (!this.ready) return;
    this.handleGlobalShortcuts();

    const screen = gameState.screen;
    const isPlaying = screen === 'hud';
    const isFlyover = ['menu', 'splash', 'onboarding', 'newGame', 'loadGame', 'auth', 'credits'].includes(screen);

    if (isFlyover) {
      this.sky.update(dt * 0.4, this.engine.scene, _worldCenter, this.weather.currentWeather);
      this.water.update(dt, _worldCenter);
      this.lava.update(dt, elapsed);
      this.volcano.update(dt, gameState.settings.graphics.particles);
      this.camRig.updateMenuFlyover(elapsed, this.engine.camera);
    } else if (isPlaying) {
      this.fpsAccum += dt;
      this.fpsSamples++;
      if (this.fpsAccum >= 1.0) {
        this.currentFps = Math.round(this.fpsSamples / this.fpsAccum);
        this.fpsSamples = 0;
        this.fpsAccum = 0;
        this.checkAdaptiveQuality();
      }

      this.handlePlayingActions();

      const pos = this.controller.position;
      this.terrain.updateStreaming(pos.x, pos.z);
      this.chunks.updateStreaming(this.terrain, pos.x, pos.z);

      this.activeEvent = this.worldEvents.update(dt, this.weather.currentWeather);
      this.sky.update(dt, this.engine.scene, pos, this.weather.currentWeather);
      this.water.update(dt, pos);
      this.lava.update(dt, elapsed);
      this.volcano.update(dt, gameState.settings.graphics.particles, pos, this.terrain);
      this.weather.update(dt, this.engine.scene, this.sky, pos, this.terrain);

      const swarmMult = this.activeEvent.type === 'meteor_swarm' ? 2.8 : 1;
      this.meteors.update(
        dt,
        this.weather.currentWeather,
        this.terrain,
        pos,
        (x, y, z, pDist) => {
          this.camRig.addTrauma(Math.max(0.15, 0.85 - pDist * 0.02));
          audioSystem.playSfx('meteor');
          this.survival.applyMeteorHit(pDist);
          if (Math.random() < 0.7 && y > WATER_LEVEL) {
            this.chunks.spawnMeteorCrystal(x, y, z);
          }
        },
        swarmMult
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

      if (this.lastBiomeSound !== this.survival.currentBiomeId) {
        this.lastBiomeSound = this.survival.currentBiomeId;
        audioSystem.setBiomeAmbience(this.survival.currentBiomeId);
      }

      this.autosaveAccum += dt;
      if (this.autosaveAccum >= AUTOSAVE_INTERVAL_SEC) {
        this.autosaveAccum = 0;
        saveGameToSlot(1, true);
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
        const nearest = this.chunks.findNearestInteractable(this.controller.position.x, this.controller.position.z);
        if (nearest) {
          this.animator.triggerInteract();
          performInteraction(nearest, this.chunks, this.sky);
        }
      }
    }
  }

  private checkAdaptiveQuality(): void {
    if (this.engine.isSoftwareGl) return;
    if (this.currentFps < 22) {
      this.lowFpsTimer += 1;
      if (this.lowFpsTimer >= 4 && gameState.settings.graphics.preset !== 'low') {
        this.lowFpsTimer = 0;
        const nextPreset = gameState.settings.graphics.preset === 'high' ? 'medium' : 'low';
        saveSettingsToLocal({
          ...gameState.settings,
          graphics: {
            ...gameState.settings.graphics,
            preset: nextPreset,
            shadows: nextPreset !== 'low',
            particles: nextPreset !== 'low',
            viewDistance: nextPreset === 'low' ? 85 : 115,
          },
        });
        eventBus.emit('toast:show', { text: t('settings.adaptiveDown'), type: 'info' });
      }
    } else {
      this.lowFpsTimer = 0;
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
      interactTarget: nearest ? { id: nearest.id, actionKey: nearest.actionKey } : null,
      activeQuestId: quest.activeQuestId,
      questProgressText: quest.progressText,
      questsCompletedCount: gameState.completedQuests.length,
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
      debug: {
        fps: this.currentFps,
        activeChunks: this.terrain.getActiveChunkCount(),
        pendingChunks: this.terrain.getPendingChunkCount(),
        drawCalls: this.engine.renderer.info.render.calls,
        playerX: p.x,
        playerY: p.y,
        playerZ: p.z,
        biomeId: biome.id,
        hazard: this.survival.currentHazard,
      },
    };

    gameState.lastHudSnapshot = snap;
    eventBus.emit('hud:update', snap);
  }

  dispose(): void {
    this.loop.dispose();
    input.detach();
    this.unsubs.forEach((u) => u());
    this.terrain?.dispose();
    this.sky?.dispose();
    this.water?.dispose();
    this.lava?.dispose();
    this.volcano?.dispose();
    this.weather?.dispose();
    this.meteors?.dispose();
    this.buildingGhost?.dispose();
    multiplayer.leave();
    this.remotePlayers?.dispose();
    this.chunks?.dispose();
    this.engine.dispose();
  }
}
