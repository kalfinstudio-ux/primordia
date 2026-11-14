import { WATER_LEVEL } from '../config';
import { gameState } from '../core/state';
import { eventBus } from '../core/eventBus';
import type { TerrainSystem } from '../world/terrain';
import type { ChunkManager } from '../world/chunkManager';
import { getItemCount, removeItem } from './inventory';

export function tryPlaceStructure(
  type: 'basic_shelter' | 'campfire_kit',
  terrain: TerrainSystem,
  chunks: ChunkManager
): boolean {
  if (getItemCount(type) <= 0) {
    return false;
  }

  const p = gameState.playerPos;
  const dist = 3.2;
  const tx = p.x + Math.sin(p.yaw) * dist;
  const tz = p.z + Math.cos(p.yaw) * dist;
  const ty = terrain.groundHeightAt(tx, tz);

  if (ty < WATER_LEVEL + 0.1) {
    return false;
  }

  removeItem(type, 1);
  gameState.placedStructures.push({
    id: `${type}_${Date.now()}`,
    type,
    x: tx,
    y: ty,
    z: tz,
    rotY: p.yaw,
  });

  chunks.syncPlacedStructures(gameState.placedStructures);
  eventBus.emit('audio:sfx', 'build');
  eventBus.emit('structure:placed', { type, x: tx, z: tz });
  return true;
}
