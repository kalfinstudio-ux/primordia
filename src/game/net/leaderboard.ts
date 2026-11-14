import { gameState } from '../core/state';
import { getSupabaseClient } from './supabaseClient';

export interface LeaderboardEntry {
  userId: string;
  score: number;
  updatedAt: string;
}

export async function submitLeaderboardScore(score: number): Promise<boolean> {
  const sb = getSupabaseClient();
  if (!sb || gameState.user.mode !== 'authenticated' || !gameState.user.userId) return false;
  try {
    // Uses server-side validated Postgres RPC with rate limiting and sanity cap
    const { error } = await sb.rpc('submit_validated_score', {
      p_score: Math.max(0, Math.round(score)),
    });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
  const sb = getSupabaseClient();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from('leaderboard')
      .select('user_id, score, updated_at')
      .order('score', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((r) => ({
      userId: String(r.user_id),
      score: Number(r.score) || 0,
      updatedAt: String(r.updated_at || ''),
    }));
  } catch {
    return [];
  }
}
