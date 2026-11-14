import { gameState } from '../core/state';
import { migrateSaveData, type SaveSlotData } from '../systems/saveLoad';
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
          saveVersion: snapshot.saveVersion,
          avatar: snapshot.avatar,
          vitals: snapshot.vitals,
          inventory: snapshot.inventory,
          playerPos: snapshot.playerPos,
          difficulty: snapshot.difficulty,
        },
        world_state: {
          placedStructures: snapshot.placedStructures,
          deathBags: snapshot.deathBags,
          storageInventories: snapshot.storageInventories,
          completedQuests: snapshot.completedQuests,
          activeQuestIdx: snapshot.activeQuestIdx,
          discoveredChunks: snapshot.discoveredChunks,
          discoveredPois: snapshot.discoveredPois,
          customWaypoints: snapshot.customWaypoints,
          unlockedRecipes: snapshot.unlockedRecipes,
          journalUnlocked: snapshot.journalUnlocked,
          campaignComplete: snapshot.campaignComplete,
          waterCollectedCount: snapshot.waterCollectedCount,
          crystalsExtractedCount: snapshot.crystalsExtractedCount,
          obsidianCollectedCount: snapshot.obsidianCollectedCount,
          meteorIronCollectedCount: snapshot.meteorIronCollectedCount,
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
      return migrateSaveData(
        {
          ...p,
          ...w,
          slot: Number(row.slot) || 1,
          source: 'cloud',
          worldSeed: String(row.world_seed || 'HADEAN-01'),
          playtimeSec: Number(row.playtime) || 0,
          updatedAt: String(row.updated_at || new Date().toISOString()),
        },
        'cloud'
      );
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
