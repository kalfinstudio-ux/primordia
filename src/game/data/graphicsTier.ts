import type { GraphicsTier } from '../config';
import { BALANCE } from './balance';

export interface FpsSample {
  fps: number;
  timeSec: number;
}

export type TierTransitionDirection = 'up' | 'down';

export interface TierDecisionInput {
  samples: readonly FpsSample[];
  currentTier: GraphicsTier;
  timeSec: number;
  lastChangeTimeSec?: number | null;
  lastChangeDirection?: TierTransitionDirection | null;
  maxTier?: GraphicsTier;
}

const TIER_ORDER: readonly GraphicsTier[] = ['low', 'medium', 'high'];

export function tierRank(tier: GraphicsTier): number {
  return TIER_ORDER.indexOf(tier);
}

export function stepTierDown(tier: GraphicsTier): GraphicsTier {
  const idx = tierRank(tier);
  return idx > 0 ? TIER_ORDER[idx - 1] : 'low';
}

export function stepTierUp(tier: GraphicsTier, maxTier: GraphicsTier = 'high'): GraphicsTier {
  const idx = tierRank(tier);
  const maxIdx = tierRank(maxTier);
  const nextIdx = Math.min(maxIdx, idx + 1);
  return TIER_ORDER[Math.max(idx, nextIdx)];
}

/**
 * Compute bloom render target dimensions from the full drawing buffer size using BALANCE.graphics.bloom.resolutionScale.
 * Half resolution (0.5) covers 25% of full-resolution pixels (~75% fewer pixels).
 */
export function computeHalfResBloomSize(fullWidth: number, fullHeight: number): { width: number; height: number } {
  const scale = BALANCE.graphics.bloom.resolutionScale;
  return {
    width: Math.max(1, Math.round(fullWidth * scale)),
    height: Math.max(1, Math.round(fullHeight * scale)),
  };
}

/** Append an FPS sample and prune samples older than the rolling retention window. */
export function recordFpsSample(
  samples: readonly FpsSample[],
  fps: number,
  timeSec: number,
  maxAgeSec = BALANCE.graphics.auto.sampleHistorySec
): FpsSample[] {
  if (!Number.isFinite(fps) || fps <= 0 || !Number.isFinite(timeSec)) {
    return [...samples];
  }
  const cutoff = timeSec - maxAgeSec;
  const next = samples.filter((s) => Number.isFinite(s.timeSec) && s.timeSec >= cutoff && s.timeSec <= timeSec);
  next.push({ fps, timeSec });
  return next;
}

/**
 * Pure Auto-tier quality decision function.
 *
 * Rules (all thresholds sourced from BALANCE.graphics.auto):
 * - Step down 1 tier when average FPS over the short window stays below `stepDownFps` for `stepDownWindowSec`.
 * - Step up 1 tier only after a much longer stable window (`stepUpWindowSec`) where average FPS >= `stepUpFps`,
 *   every sample in that window >= `stepUpMinFps`, and post-drop cooldown (`cooldownAfterDownSec`) has elapsed.
 * - Never evaluates samples recorded at or before `lastChangeTimeSec` to prevent double-steps or oscillation.
 */
export function decideGraphicsTier(input: TierDecisionInput): GraphicsTier {
  const cfg = BALANCE.graphics.auto;
  const { samples, currentTier, timeSec } = input;
  if (!Number.isFinite(timeSec) || samples.length === 0) return currentTier;

  const maxTier = input.maxTier ?? 'high';
  const lastChange = input.lastChangeTimeSec ?? null;
  const lastDir = input.lastChangeDirection ?? null;

  // Enforce upper bound if maxTier changed (e.g. software WebGL fallback).
  if (tierRank(currentTier) > tierRank(maxTier)) {
    return stepTierDown(currentTier);
  }

  // Only inspect valid samples belonging to the current tier epoch.
  const epochStart = lastChange !== null ? lastChange : -Infinity;
  const valid = samples.filter(
    (s) =>
      Number.isFinite(s.fps) &&
      s.fps > 0 &&
      Number.isFinite(s.timeSec) &&
      s.timeSec > epochStart &&
      s.timeSec <= timeSec
  );

  if (valid.length === 0) return currentTier;

  // 1. Check step down
  if (currentTier !== 'low') {
    const canStepDown =
      lastChange === null || lastDir !== 'up' || timeSec - lastChange >= cfg.cooldownAfterUpSec;
    if (canStepDown) {
      const downCutoff = timeSec - cfg.stepDownWindowSec;
      const downSamples = valid.filter((s) => s.timeSec >= downCutoff);
      if (downSamples.length >= cfg.minStepDownSamples) {
        let minT = Infinity;
        let maxT = -Infinity;
        let sum = 0;
        for (let i = 0; i < downSamples.length; i++) {
          const s = downSamples[i];
          if (s.timeSec < minT) minT = s.timeSec;
          if (s.timeSec > maxT) maxT = s.timeSec;
          sum += s.fps;
        }
        // 1 Hz integer sampling over 5s produces timestamps e.g. 1..5 (span = 4s); allow 1s sample interval slack.
        const coveredSpan = maxT - minT;
        const freshEnough = timeSec - maxT <= 1.5;
        if (freshEnough && coveredSpan >= cfg.stepDownWindowSec - 1.0) {
          const avg = sum / downSamples.length;
          if (avg < cfg.stepDownFps) {
            return stepTierDown(currentTier);
          }
        }
      }
    }
  }

  // 2. Check step up (strict hysteresis)
  if (tierRank(currentTier) < tierRank(maxTier)) {
    const canStepUp =
      lastChange === null || lastDir !== 'down' || timeSec - lastChange >= cfg.cooldownAfterDownSec;
    if (canStepUp) {
      const upCutoff = timeSec - cfg.stepUpWindowSec;
      const upSamples = valid.filter((s) => s.timeSec >= upCutoff);
      if (upSamples.length >= cfg.minStepUpSamples) {
        let minT = Infinity;
        let maxT = -Infinity;
        let sum = 0;
        let minFps = Infinity;
        for (let i = 0; i < upSamples.length; i++) {
          const s = upSamples[i];
          if (s.timeSec < minT) minT = s.timeSec;
          if (s.timeSec > maxT) maxT = s.timeSec;
          if (s.fps < minFps) minFps = s.fps;
          sum += s.fps;
        }
        const coveredSpan = maxT - minT;
        const freshEnough = timeSec - maxT <= 1.5;
        if (freshEnough && coveredSpan >= cfg.stepUpWindowSec - 1.0) {
          const avg = sum / upSamples.length;
          if (avg >= cfg.stepUpFps && minFps >= cfg.stepUpMinFps) {
            return stepTierUp(currentTier, maxTier);
          }
        }
      }
    }
  }

  return currentTier;
}
