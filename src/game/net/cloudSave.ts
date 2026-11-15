import { gameState } from '../core/state';
import { CLOUD_SAVE_SLOT, migrateSaveData, type SaveData } from '../systems/saveLoad';
import { getSupabaseClient } from './supabaseClient';

export async function saveToCloud(snapshot: SaveData): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb || gameState.user.mode !== 'authenticated' || !gameState.user.userId) {
    return false;
  }
  try {
    const { error } = await sb.from('game_saves').upsert(
      {
        user_id: gameState.user.userId,
        slot: CLOUD_SAVE_SLOT,
        world_seed: snapshot.worldSeed,
        player_state: {
          saveVersion: snapshot.saveVersion,
          avatar: snapshot.avatar,
          vitals: snapshot.vitals,
          inventory: snapshot.inventory,
          playerPos: snapshot.playerPos,
          difficulty: snapshot.difficulty,
          bornAtMs: snapshot.bornAtMs,
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
          wisdomPerks: snapshot.wisdomPerks,
          journalUnlocked: snapshot.journalUnlocked,
          brukMoments: snapshot.brukMoments,
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

/**
 * Simpanan cloud terbaru milik akun. Akun lama mungkin punya baris di slot 2/3 (sistem slot dulu);
 * baris itu tidak dihapus, tetapi yang terbaru yang dianggap simpanan cloud.
 */
export async function fetchCloudSave(): Promise<SaveData | null> {
  const sb = getSupabaseClient();
  if (!sb || gameState.user.mode !== 'authenticated' || !gameState.user.userId) {
    return null;
  }
  try {
    const { data, error } = await sb
      .from('game_saves')
      .select('*')
      .eq('user_id', gameState.user.userId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error || !data || data.length === 0) return null;
    const row = data[0];
    const p = (row.player_state || {}) as Record<string, unknown>;
    const w = (row.world_state || {}) as Record<string, unknown>;
    return migrateSaveData(
      {
        ...p,
        ...w,
        source: 'cloud',
        worldSeed: String(row.world_seed || 'HADEAN-01'),
        playtimeSec: Number(row.playtime) || 0,
        updatedAt: String(row.updated_at || new Date().toISOString()),
      },
      'cloud'
    );
  } catch {
    return null;
  }
}
