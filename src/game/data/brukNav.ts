/**
 * Pure navigation & obstacle-avoidance steering for Bruk (no Three.js / React).
 * Zero per-frame heap allocations when caller reuses `BrukNavState` and output buffers.
 */

export const BRUK_MAX_WATER_DEPTH = 0.6;
export const BRUK_STUCK_RETURN_SEC = 4.0;
export const BRUK_HOME_RESET_DIST = 1.6;
export const BRUK_PLAYER_RADIUS = 0.45;

/** Nearest-free-direction angular offsets in radians (front first, fanning left/right). */
export const BRUK_NAV_OFFSETS_RAD: readonly number[] = [
  0,
  (20 * Math.PI) / 180,
  (-20 * Math.PI) / 180,
  (42 * Math.PI) / 180,
  (-42 * Math.PI) / 180,
  (68 * Math.PI) / 180,
  (-68 * Math.PI) / 180,
  (95 * Math.PI) / 180,
  (-95 * Math.PI) / 180,
  (125 * Math.PI) / 180,
  (-125 * Math.PI) / 180,
  (155 * Math.PI) / 180,
  (-155 * Math.PI) / 180,
];

export interface NavObstacle {
  id: string;
  x: number;
  z: number;
  radius: number;
}

export interface NavWaterSampler {
  groundHeightAt(x: number, z: number): number;
  waterLevel: number;
}

export interface BrukNavState {
  returningHome: boolean;
  stuckSec: number;
  lastProgressX: number;
  lastProgressZ: number;
  progressWindowSec: number;
  lastGoalX: number;
  lastGoalZ: number;
  lastHeading: number;
  hasHeading: boolean;
  avoidSide: -1 | 0 | 1;
}

export interface SteerStepResult {
  nextX: number;
  nextZ: number;
  moved: number;
  heading: number;
  remaining: number;
  blocked: boolean;
  returningHome: boolean;
}

export interface PushSeparationOut {
  brukX: number;
  brukZ: number;
  playerX: number;
  playerZ: number;
  separated: boolean;
}

const PROBE_FRACS: readonly number[] = [0.18, 0.42, 0.7, 1.0];
const DEFAULT_IGNORE_IDS: ReadonlySet<string> = new Set(['bruk_body']);

export function makeBrukNavState(x = 0, z = 0): BrukNavState {
  return {
    returningHome: false,
    stuckSec: 0,
    lastProgressX: x,
    lastProgressZ: z,
    progressWindowSec: 0,
    lastGoalX: x,
    lastGoalZ: z,
    lastHeading: 0,
    hasHeading: false,
    avoidSide: 0,
  };
}

export function resetBrukNavState(state: BrukNavState, x: number, z: number): void {
  state.returningHome = false;
  state.stuckSec = 0;
  state.lastProgressX = x;
  state.lastProgressZ = z;
  state.progressWindowSec = 0;
  state.lastGoalX = x;
  state.lastGoalZ = z;
  state.lastHeading = 0;
  state.hasHeading = false;
  state.avoidSide = 0;
}

export function makeSteerStepResult(): SteerStepResult {
  return {
    nextX: 0,
    nextZ: 0,
    moved: 0,
    heading: 0,
    remaining: 0,
    blocked: false,
    returningHome: false,
  };
}

export function makePushSeparationOut(): PushSeparationOut {
  return { brukX: 0, brukZ: 0, playerX: 0, playerZ: 0, separated: false };
}

function fin(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/** Check if a single point (x, z) is free of obstacles and shallow enough (water depth <= maxWaterDepth). */
export function isPointPassable(
  x: number,
  z: number,
  bodyRadius: number,
  obstacles: readonly NavObstacle[],
  sampler: NavWaterSampler,
  maxWaterDepth = BRUK_MAX_WATER_DEPTH,
  ignoreId = 'bruk_body'
): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const gh = sampler.groundHeightAt(x, z);
  if (!Number.isFinite(gh)) return false;
  if (sampler.waterLevel - gh > maxWaterDepth) return false;

  const pad = 0.08;
  for (let i = 0; i < obstacles.length; i++) {
    const obs = obstacles[i];
    if (!obs || obs.id === ignoreId || DEFAULT_IGNORE_IDS.has(obs.id)) continue;
    const minDist = bodyRadius + Math.max(0, obs.radius) + pad;
    const dx = x - obs.x;
    const dz = z - obs.z;
    if (dx * dx + dz * dz < minDist * minDist) {
      return false;
    }
  }
  return true;
}

/** Sample along a line from (curX, curZ) in direction `angle` up to `probeDist`. */
export function isDirectionClear(
  curX: number,
  curZ: number,
  angle: number,
  probeDist: number,
  bodyRadius: number,
  obstacles: readonly NavObstacle[],
  sampler: NavWaterSampler,
  maxWaterDepth = BRUK_MAX_WATER_DEPTH
): boolean {
  const sinA = Math.sin(angle);
  const cosA = Math.cos(angle);
  const d = Math.max(0.4, probeDist);
  for (let i = 0; i < PROBE_FRACS.length; i++) {
    const dist = d * PROBE_FRACS[i];
    const sx = curX + sinA * dist;
    const sz = curZ + cosA * dist;
    if (!isPointPassable(sx, sz, bodyRadius, obstacles, sampler, maxWaterDepth)) {
      return false;
    }
  }
  return true;
}

/**
 * Steer Bruk from (curX, curZ) toward (targetX, targetZ), picking the nearest clear angular offset
 * around rocks, crystals, structures, players, and water deeper than 0.6 m.
 * Detects getting stuck (> 4 s without meaningful progress) and falls back to `(homeX, homeZ)`.
 */
export function steerBrukToward(
  state: BrukNavState,
  curX: number,
  curZ: number,
  targetX: number,
  targetZ: number,
  homeX: number,
  homeZ: number,
  speed: number,
  dt: number,
  bodyRadius: number,
  obstacles: readonly NavObstacle[],
  sampler: NavWaterSampler,
  out: SteerStepResult = makeSteerStepResult(),
  maxWaterDepth = BRUK_MAX_WATER_DEPTH
): SteerStepResult {
  const safeCurX = fin(curX, homeX);
  const safeCurZ = fin(curZ, homeZ);
  const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0;
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 0;

  if (state.returningHome) {
    const distHome = Math.hypot(homeX - safeCurX, homeZ - safeCurZ);
    if (distHome <= BRUK_HOME_RESET_DIST) {
      state.returningHome = false;
      state.stuckSec = 0;
      state.lastProgressX = safeCurX;
      state.lastProgressZ = safeCurZ;
      state.progressWindowSec = 0;
    }
  }

  // Clear return-to-home recovery if target itself shifted significantly toward home or away
  const goalChanged = Math.hypot(targetX - state.lastGoalX, targetZ - state.lastGoalZ) > 3.5;
  if (goalChanged && !state.returningHome) {
    state.stuckSec = 0;
    state.progressWindowSec = 0;
    state.lastProgressX = safeCurX;
    state.lastProgressZ = safeCurZ;
  }
  state.lastGoalX = fin(targetX, homeX);
  state.lastGoalZ = fin(targetZ, homeZ);

  const gx = state.returningHome ? fin(homeX, safeCurX) : fin(targetX, safeCurX);
  const gz = state.returningHome ? fin(homeZ, safeCurZ) : fin(targetZ, safeCurZ);
  const dx = gx - safeCurX;
  const dz = gz - safeCurZ;
  const distToGoal = Math.hypot(dx, dz);

  out.nextX = safeCurX;
  out.nextZ = safeCurZ;
  out.moved = 0;
  out.remaining = distToGoal;
  out.blocked = false;
  out.returningHome = state.returningHome;
  out.heading = distToGoal > 1e-5 ? Math.atan2(dx, dz) : state.lastHeading;

  if (safeDt <= 0 || safeSpeed <= 0 || distToGoal <= 0.08) {
    if (distToGoal <= 0.08) {
      state.stuckSec = 0;
      state.progressWindowSec = 0;
    }
    return out;
  }

  const desiredAngle = Math.atan2(dx, dz);
  const stepMax = Math.min(distToGoal, safeSpeed * safeDt);
  const probeDist = Math.max(bodyRadius + 0.85, Math.min(2.6, distToGoal));

  let chosenAngle: number | null = null;
  let chosenOffset = 0;
  let bestScore = Infinity;

  // Evaluate nearest-to-target fan; check stepMax passability + maintain heading/side continuity
  for (let i = 0; i < BRUK_NAV_OFFSETS_RAD.length; i++) {
    const offset = BRUK_NAV_OFFSETS_RAD[i];
    const candAngle = desiredAngle + offset;
    const stepX = safeCurX + Math.sin(candAngle) * stepMax;
    const stepZ = safeCurZ + Math.cos(candAngle) * stepMax;
    if (!isPointPassable(stepX, stepZ, bodyRadius, obstacles, sampler, maxWaterDepth)) {
      continue;
    }
    if (!isDirectionClear(safeCurX, safeCurZ, candAngle, probeDist, bodyRadius, obstacles, sampler, maxWaterDepth)) {
      continue;
    }
    let score = Math.abs(offset);
    if (i > 0) {
      if (state.avoidSide !== 0 && Math.sign(offset) === state.avoidSide) {
        score -= 0.35;
      }
      if (state.hasHeading) {
        let diffPrev = candAngle - state.lastHeading;
        while (diffPrev > Math.PI) diffPrev -= Math.PI * 2;
        while (diffPrev < -Math.PI) diffPrev += Math.PI * 2;
        score += Math.abs(diffPrev) * 0.25;
      }
    }
    if (score < bestScore) {
      bestScore = score;
      chosenAngle = candAngle;
      chosenOffset = offset;
      if (i === 0) break; // Direct straight path is clear
    }
  }

  if (chosenAngle === null) {
    // Also check if moving a short step (stepMax) is passable in any direction as emergency unstick
    for (let i = 0; i < BRUK_NAV_OFFSETS_RAD.length; i++) {
      const offset = BRUK_NAV_OFFSETS_RAD[i];
      const candAngle = desiredAngle + offset;
      const tx = safeCurX + Math.sin(candAngle) * stepMax;
      const tz = safeCurZ + Math.cos(candAngle) * stepMax;
      if (isPointPassable(tx, tz, bodyRadius, obstacles, sampler, maxWaterDepth)) {
        chosenAngle = candAngle;
        chosenOffset = offset;
        break;
      }
    }
  }

  if (chosenAngle !== null) {
    const nx = safeCurX + Math.sin(chosenAngle) * stepMax;
    const nz = safeCurZ + Math.cos(chosenAngle) * stepMax;
    if (isPointPassable(nx, nz, bodyRadius, obstacles, sampler, maxWaterDepth)) {
      out.nextX = nx;
      out.nextZ = nz;
      out.moved = stepMax;
      out.heading = chosenAngle;
      state.lastHeading = chosenAngle;
      state.hasHeading = true;
      state.avoidSide = chosenOffset === 0 ? 0 : (chosenOffset > 0 ? 1 : -1);
    } else {
      out.blocked = true;
    }
  } else {
    out.blocked = true;
  }

  out.remaining = Math.hypot(gx - out.nextX, gz - out.nextZ);

  // Stuck detection: if intending to travel (>0.8m away) and net progress stays below 0.35m over 0.5s ticks
  if (!state.returningHome && distToGoal > 0.8) {
    if (out.blocked) {
      state.stuckSec += safeDt;
    } else {
      state.progressWindowSec += safeDt;
      if (state.progressWindowSec >= 0.5) {
        const netMoved = Math.hypot(out.nextX - state.lastProgressX, out.nextZ - state.lastProgressZ);
        if (netMoved < 0.25) {
          state.stuckSec += state.progressWindowSec;
        } else {
          state.stuckSec = Math.max(0, state.stuckSec - state.progressWindowSec * 0.5);
        }
        state.lastProgressX = out.nextX;
        state.lastProgressZ = out.nextZ;
        state.progressWindowSec = 0;
      }
    }
    if (state.stuckSec > BRUK_STUCK_RETURN_SEC) {
      state.returningHome = true;
      state.stuckSec = 0;
      state.progressWindowSec = 0;
      out.returningHome = true;
    }
  } else if (state.returningHome && out.blocked) {
    state.stuckSec += safeDt;
    if (state.stuckSec > BRUK_STUCK_RETURN_SEC) {
      // Give up forced return-home loop if home itself is completely fenced off
      state.returningHome = false;
      state.stuckSec = 0;
      out.returningHome = false;
    }
  }

  return out;
}

/**
 * Gentle mutual separation when Bruk and player overlap (< minDist = brukRadius + playerRadius).
 * Pushes both gently apart without teleporting; respects max push speed per frame.
 */
export function resolveBrukPlayerPush(
  brukX: number,
  brukZ: number,
  playerX: number,
  playerZ: number,
  minDist: number,
  dt: number,
  out: PushSeparationOut = makePushSeparationOut()
): PushSeparationOut {
  const bx = fin(brukX, 0);
  const bz = fin(brukZ, 0);
  const px = fin(playerX, 0);
  const pz = fin(playerZ, 0);
  out.brukX = bx;
  out.brukZ = bz;
  out.playerX = px;
  out.playerZ = pz;
  out.separated = false;

  const safeMin = Number.isFinite(minDist) && minDist > 0 ? minDist : 1.75;
  const dx = px - bx;
  const dz = pz - bz;
  const distSq = dx * dx + dz * dz;
  if (distSq >= safeMin * safeMin) return out;

  const dist = Math.sqrt(distSq);
  const nx = dist > 1e-4 ? dx / dist : 0;
  const nz = dist > 1e-4 ? dz / dist : 1;
  const overlap = safeMin - dist;

  // Cap single-step push for gentle physical contact rather than teleporting
  const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.25) : 0.016;
  const maxStep = Math.max(0.06, 3.2 * safeDt);
  const totalPush = Math.min(overlap, maxStep);

  // Player is lighter (65%), Bruk yields gently too (35%)
  const playerShare = totalPush * 0.65;
  const brukShare = totalPush * 0.35;

  out.playerX = px + nx * playerShare;
  out.playerZ = pz + nz * playerShare;
  out.brukX = bx - nx * brukShare;
  out.brukZ = bz - nz * brukShare;
  out.separated = totalPush > 1e-5;
  return out;
}
