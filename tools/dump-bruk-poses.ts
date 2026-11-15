/**
 * Cetak pose Bruk untuk tingkat 0..4 (dari logika murni brukBehavior.ts) sebagai JSON untuk pratinjau:
 *   npx tsx tools/dump-bruk-poses.ts > /tmp/poses.json
 *   python3 tools/make_bruk.py --preview /tmp/prev --poses /tmp/poses.json
 * Situasi: pemain 10 m tepat di depan Bruk, waktu 0.
 */
import { brukPose, makeInput } from '../src/game/data/brukBehavior';

const levels = [0, 1, 2, 3, 4].map((level) => {
  const p = brukPose({ ...makeInput(), level, time: 0, dist: 10, bearing: 0, baseYaw: 0 });
  return { lean: p.lean, glow: p.glow, eyeGlow: p.eyeGlow, eyeOpen: p.eyeOpen, crackColor: p.crackColor, eyeColor: p.eyeColor, arms: p.arms, headYaw: p.headYaw, yaw: p.yaw };
});
console.log(JSON.stringify({ levels }));
