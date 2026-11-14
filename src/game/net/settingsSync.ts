import { gameState, saveSettingsToLocal } from '../core/state';
import type { GameSettings } from '../config';
import { getSupabaseClient } from './supabaseClient';

export async function pushCloudSettings(): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb || gameState.user.mode !== 'authenticated' || !gameState.user.userId) return false;
  try {
    const { error } = await sb.from('user_settings').upsert({
      user_id: gameState.user.userId,
      settings: gameState.settings,
      updated_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

export async function pullCloudSettings(): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb || gameState.user.mode !== 'authenticated' || !gameState.user.userId) return false;
  try {
    const { data, error } = await sb
      .from('user_settings')
      .select('settings')
      .eq('user_id', gameState.user.userId)
      .maybeSingle();

    if (error || !data?.settings) return false;
    const remote = data.settings as Partial<GameSettings>;
    saveSettingsToLocal({
      ...gameState.settings,
      ...remote,
      graphics: { ...gameState.settings.graphics, ...(remote.graphics || {}) },
      audio: { ...gameState.settings.audio, ...(remote.audio || {}) },
      controls: {
        ...gameState.settings.controls,
        ...(remote.controls || {}),
        keys: { ...gameState.settings.controls.keys, ...(remote.controls?.keys || {}) },
      },
      gameplay: { ...gameState.settings.gameplay, ...(remote.gameplay || {}) },
    });
    return true;
  } catch {
    return false;
  }
}
