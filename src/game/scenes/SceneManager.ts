import * as THREE from 'three';
import { AUTOSAVE_INTERVAL_SEC, WATER_LEVEL } from '../config';
import { Engine } from '../core/engine';
import { GameLoop } from '../core/loop';
import { input } from '../core/input';
import { loadProceduralAssets, type ProceduralAssets } from '../core/assetLoader';
import { gameState, setScreen, type HudSnapshot } from '../core/state';
import { eventBus } from '../core/eventBus';
import { TerrainSystem } from '../world/terrain';
import { SkySystem } from '../world/sky';
import { WaterSystem } from '../world/water';
import { LavaSystem } from '../world/lava';
import { VolcanoSystem } from '../world/volcano';
import { WeatherSystem } from '../world/weather';
import { MeteorSystem } from '../world/meteors';
import { ChunkManager } from '../world/chunkManager';
import { VOLCANO_MAIN } from '../world/biomes';
import { createExplorerCharacter, type CharacterRig } from '../player/character';
import { CharacterAnimator } from '../player/animator';
import { PlayerController } from '../player/controller';
import { ThirdPersonCamera } from '../player/camera';
import { SurvivalSystem } from '../systems/survival';
import { performInteraction } from '../systems/interaction';
import { tryPlaceStructure } from '../systems/building';
import { evaluateQuests } from '../systems/quests';
import { getHotbarSlots, useHotbarSlot } from '../systems/inventory';
import { saveGameToSlot } from '../systems/saveLoad';
import { audioSystem } from '../systems/audio';
import { t } from '../utils/i18n';

const _worldCenter = new THREE.Vector3(0, 0, 0);

export class SceneManager {
  private engine: Engine;
  private loop: GameLoop;
  private assets!: ProceduralAssets;
  private terrain!: TerrainSystem;
  private sky!: SkySystem;
  private water!: WaterSystem;
  private lava!: LavaSystem;
  private volcano!: VolcanoSystem;
  private weather!: WeatherSystem;
  private meteors!: MeteorSystem;
  private chunks!: ChunkManager;
  private character!: CharacterRig;
  private animator = new CharacterAnimator();
  private controller: PlayerController;
  private camRig = new ThirdPersonCamera();
  private survival = new SurvivalSystem();

  private hudEmitAccum = 0;
  private autosaveAccum = 0;
  private ready = false;
  private unsubs: Array<() => void> = [];

  constructor(container: HTMLElement) {
    this.engine = new Engine(container);
    input.attach(this.engine.renderer.domElement);

    this.controller = new PlayerController({
      onJump: () => audioSystem.playSfx('jump'),
      onFootstep: () => audioSystem.playSfx('step'),
    });

    this.loop = new GameLoop(this.engine.renderer, (dt, elapsed) => this.tick(dt, elapsed));

    this.unsubs.push(
      eventBus.on('world:quake', (p) => {
        const data = p as { intensity?: number };
        this.camRig.addTrauma(data?.intensity ?? 0.35);
      }),
      eventBus.on('world:lightning', () => {
        audioSystem.playSfx('thunder');
      }),
      eventBus.on('world:requestPlaceStructure', (kind) => {
        if (!this.ready) return;
        const type = kind as 'basic_shelter' | 'campfire_kit';
        const ok = tryPlaceStructure(type, this.terrain, this.chunks);
        if (!ok) {
          eventBus.emit('toast:show', { text: t('inventory.missingMaterials'), type: 'warn' });
        } else {
          eventBus.emit('toast:show', { text: t(`items.${type}.name`), type: 'success' });
        }
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
    this.engine.scene.add(this.terrain.mesh);

    this.sky = new SkySystem(this.engine.scene, this.engine.isSoftwareGl);
    this.water = new WaterSystem(this.engine.scene);
    this.lava = new LavaSystem(this.engine.scene, this.terrain, this.assets);
    this.volcano = new VolcanoSystem(this.engine.scene, this.terrain);
    this.weather = new WeatherSystem(this.engine.scene);
    this.meteors = new MeteorSystem(this.engine.scene);
    this.chunks = new ChunkManager(this.engine.scene, this.terrain, gameState.worldSeed, this.assets);

    this.character = createExplorerCharacter(gameState.avatar, this.assets.contactShadowTexture);
    this.character.root.visible = false;
    this.engine.scene.add(this.character.root);

    this.engine.prewarm();
    this.ready = true;
    this.sky.update(0.016, this.engine.scene, _worldCenter, this.weather.currentWeather);
    this.camRig.updateMenuFlyover(0, this.engine.camera);
    this.engine.render();
    this.loop.start();
  }

  enterWorld(resetPlayer: boolean): void {
    if (!this.ready) return;
    this.terrain.setSeed(gameState.worldSeed);
    this.chunks.populate(this.terrain, gameState.worldSeed);
    this.chunks.syncPlacedStructures(gameState.placedStructures);
    this.character.applyAppearance(gameState.avatar);
    this.character.root.visible = true;

    const p = gameState.playerPos;
    if (resetPlayer) {
      this.controller.resetTo(0, 18, Math.PI, this.terrain);
    } else {
      this.controller.resetTo(p.x, p.z, p.yaw, this.terrain);
    }
    this.camRig.snapToPlayer(this.controller.position, 0);
    this.camRig.updateGameplay(0.016, this.engine.camera, this.controller.position, this.terrain);
    this.autosaveAccum = 0;
    this.emitHudSnapshot();
    this.engine.render();
  }

  enterMenuFlyover(): void {
    if (!this.ready) return;
    this.character.root.visible = false;
    this.camRig.updateMenuFlyover(0, this.engine.camera);
    this.engine.render();
  }

  respawnAtSafeRidge(): void {
    gameState.vitals = {
      health: 100,
      stamina: 100,
      temperature: 37.0,
      oxygen: 100,
      water: 85,
    };
    this.controller.resetTo(0, 18, Math.PI, this.terrain);
    this.camRig.snapToPlayer(this.controller.position, Math.PI);
    setScreen('hud');
    this.emitHudSnapshot();
  }

  private tick(dt: number, elapsed: number): void {
    if (!this.ready) return;

    const screen = gameState.screen;
    const isPlaying = screen === 'hud';
    const isFlyover = screen === 'menu' || screen === 'splash' || screen === 'onboarding' || screen === 'newGame' || screen === 'loadGame' || screen === 'auth' || screen === 'credits';

    // Handle global gameplay shortcuts
    if (isPlaying || screen === 'pause' || screen === 'inventory') {
      if (input.consumeJustPressed('Escape') || input.consumeJustPressed('KeyP')) {
        if (screen === 'hud') {
          document.exitPointerLock?.();
          setScreen('pause');
        } else if (screen === 'pause' || screen === 'inventory') {
          setScreen('hud');
        }
      }
      const invKey = gameState.settings.controls.keys.inventory;
      if (input.consumeJustPressed(invKey) || input.consumeJustPressed('Tab')) {
        if (screen === 'hud') {
          document.exitPointerLock?.();
          setScreen('inventory');
        } else if (screen === 'inventory') {
          setScreen('hud');
        }
      }
    }

    if (isFlyover) {
      this.sky.update(dt * 0.4, this.engine.scene, _worldCenter, this.weather.currentWeather);
      this.water.update(dt);
      this.lava.update(dt, elapsed);
      this.volcano.update(dt, gameState.settings.graphics.particles);
      this.camRig.updateMenuFlyover(elapsed, this.engine.camera);
    } else if (isPlaying) {
      gameState.playtimeSec += dt;

      // Hotbar keys 1..6
      for (let i = 0; i < 6; i++) {
        if (input.consumeJustPressed(`Digit${i + 1}`)) {
          useHotbarSlot(i);
        }
      }

      // Build shortcut [B]
      const buildKey = gameState.settings.controls.keys.build;
      if (input.consumeJustPressed(buildKey)) {
        const ok = tryPlaceStructure('basic_shelter', this.terrain, this.chunks);
        if (!ok) {
          eventBus.emit('toast:show', { text: t('inventory.missingMaterials'), type: 'warn' });
        } else {
          eventBus.emit('toast:show', { text: t('items.basic_shelter.name'), type: 'success' });
        }
      }

      const moveRes = this.controller.update(
        dt,
        this.camRig.yaw,
        this.terrain,
        this.character,
        this.animator,
        elapsed
      );
      gameState.distanceExplored += moveRes.distanceMoved;

      this.sky.update(dt, this.engine.scene, this.controller.position, this.weather.currentWeather);
      this.water.update(dt);
      this.lava.update(dt, elapsed);
      this.volcano.update(dt, gameState.settings.graphics.particles);
      this.weather.update(dt, this.engine.scene, this.sky, this.controller.position);
      this.meteors.update(dt, this.weather.currentWeather, this.terrain, this.controller.position, (x, y, z, pDist) => {
        this.camRig.addTrauma(Math.max(0.15, 0.85 - pDist * 0.02));
        audioSystem.playSfx('meteor');
        this.survival.applyMeteorHit(pDist);
        if (Math.random() < 0.7 && y > WATER_LEVEL) {
          this.chunks.spawnMeteorCrystal(x, y, z);
        }
      });

      this.camRig.updateGameplay(dt, this.engine.camera, this.controller.position, this.terrain);

      const nearest = this.chunks.findNearestInteractable(this.controller.position.x, this.controller.position.z);
      const interactKey = gameState.settings.controls.keys.interact;
      if (nearest && input.consumeJustPressed(interactKey)) {
        this.animator.triggerInteract();
        performInteraction(nearest, this.chunks);
      }

      const groundY = this.terrain.groundHeightAt(this.controller.position.x, this.controller.position.z);
      const inMeteorDanger = this.meteors.isPlayerInDangerZone(this.controller.position.x, this.controller.position.z);
      this.survival.update(
        dt,
        groundY,
        this.weather.currentWeather,
        this.sky.getTimeOfDay(),
        moveRes.inLava,
        inMeteorDanger
      );

      // 60-second autosave
      this.autosaveAccum += dt;
      if (this.autosaveAccum >= AUTOSAVE_INTERVAL_SEC) {
        this.autosaveAccum = 0;
        saveGameToSlot(1, true);
      }

      // Throttled HUD snapshot <= 10Hz
      this.hudEmitAccum += dt;
      if (this.hudEmitAccum >= 0.1) {
        this.hudEmitAccum = 0;
        this.emitHudSnapshot();
      }
    }

    input.endFrame();
    this.engine.render();
  }

  private emitHudSnapshot(): void {
    const p = this.controller.position;
    const nearest = this.chunks.findNearestInteractable(p.x, p.z);
    const quest = evaluateQuests();
    const headingRad = ((-this.camRig.yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const headingDeg = Math.round((headingRad * 180) / Math.PI);

    const minimapNodes: HudSnapshot['minimapNodes'] = [
      { x: VOLCANO_MAIN.x, z: VOLCANO_MAIN.z, kind: 'volcano' },
    ];
    for (const item of this.chunks.interactables) {
      if (item.depleted) continue;
      if (item.kind === 'water' || item.kind === 'crystal' || item.kind === 'shelter') {
        minimapNodes.push({ x: item.x, z: item.z, kind: item.kind });
      }
    }

    const snap: HudSnapshot = {
      vitals: { ...gameState.vitals },
      headingDeg,
      playerX: p.x,
      playerZ: p.z,
      timeOfDay: this.sky.getTimeOfDay(),
      weather: this.weather.currentWeather,
      hazard: this.survival.currentHazard,
      interactTarget: nearest ? { id: nearest.id, actionKey: nearest.actionKey } : null,
      activeQuestId: quest.activeQuestId,
      questProgressText: quest.progressText,
      questsCompletedCount: gameState.completedQuests.length,
      hotbar: getHotbarSlots(),
      selectedHotbarIdx: gameState.selectedHotbarIdx,
      distanceExplored: Math.round(gameState.distanceExplored),
      playtimeSec: Math.round(gameState.playtimeSec),
      minimapNodes,
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
    this.chunks?.dispose();
    this.engine.dispose();
  }
}
