import { gameState } from '../core/state';
import type { SaveSlotData } from '../systems/saveLoad';
import { getSupabaseClient } from './supabaseClient';

export async function saveToCloud(snapshot: SaveSlotData): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb || gameState.user.mode !== 'authenticated' || !gameState.user.userId) {
    return false;
  }
  try {
    const { error } = await sb.from('game_saves').upsert(
      {
        user_id: gameState.user.userId,
        slot: snapshot.slot,
        world_seed: snapshot.worldSeed,
        player_state: {
          avatar: snapshot.avatar,
          vitals: snapshot.vitals,
          inventory: snapshot.inventory,
          playerPos: snapshot.playerPos,
          difficulty: snapshot.difficulty,
        },
        world_state: {
          placedStructures: snapshot.placedStructures,
          completedQuests: snapshot.completedQuests,
          activeQuestIdx: snapshot.activeQuestIdx,
          waterCollectedCount: snapshot.waterCollectedCount,
          crystalsExtractedCount: snapshot.crystalsExtractedCount,
          distanceExplored: snapshot.distanceExplored,
        },
        playtime: snapshot.playtimeSec,
        updated_at: snapshot.updatedAt,
      },
      { onConflict: 'user_id,slot' }
    );
    return !error;
  } catch {
    return false;
  }
}

export async function listCloudSaves(): Promise<SaveSlotData[]> {
  const sb = getSupabaseClient();
  if (!sb || gameState.user.mode !== 'authenticated' || !gameState.user.userId) {
    return [];
  }
  try {
    const { data, error } = await sb
      .from('game_saves')
      .select('*')
      .eq('user_id', gameState.user.userId)
      .order('slot', { ascending: true });

    if (error || !data) return [];

    return data.map((row) => {
      const p = (row.player_state || {}) as Record<string, unknown>;
      const w = (row.world_state || {}) as Record<string, unknown>;
      return {
        slot: Number(row.slot) || 1,
        source: 'cloud' as const,
        worldSeed: String(row.world_seed || 'HADEAN-01'),
        difficulty: (p.difficulty as SaveSlotData['difficulty']) || 'survivor',
        avatar: (p.avatar as SaveSlotData['avatar']) || gameState.avatar,
        vitals: (p.vitals as SaveSlotData['vitals']) || gameState.vitals,
        inventory: (p.inventory as SaveSlotData['inventory']) || [],
        playerPos: (p.playerPos as SaveSlotData['playerPos']) || { x: 0, y: 0, z: 18, yaw: Math.PI },
        placedStructures: (w.placedStructures as SaveSlotData['placedStructures']) || [],
        completedQuests: (w.completedQuests as string[]) || [],
        activeQuestIdx: Number(w.activeQuestIdx) || 0,
        waterCollectedCount: Number(w.waterCollectedCount) || 0,
        crystalsExtractedCount: Number(w.crystalsExtractedCount) || 0,
        distanceExplored: Number(w.distanceExplored) || 0,
        playtimeSec: Number(row.playtime) || 0,
        updatedAt: String(row.updated_at || new Date().toISOString()),
      };
    });
  } catch {
    return [];
  }
}

export async function deleteCloudSave(slot: number): Promise<void> {
  const sb = getSupabaseClient();
  if (!sb || gameState.user.mode !== 'authenticated' || !gameState.user.userId) return;
  try {
    await sb.from('game_saves').delete().eq('user_id', gameState.user.userId).eq('slot', slot);
  } catch {
    // Ignore offline error
  }
}
