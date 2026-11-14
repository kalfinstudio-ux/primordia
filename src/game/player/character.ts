import * as THREE from 'three';
import type { AvatarConfig, Gender } from '../config';

export interface CharacterRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  torsoGroup: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
  toolMesh: THREE.Group;
  backShieldMesh: THREE.Mesh;
  breathPuff: THREE.Mesh;
  applyAppearance: (avatar: AvatarConfig) => void;
  setEquipmentVisuals: (toolId: string | null, hasShield: boolean) => void;
  setSootAmount: (soot: number) => void;
}

type V3 = [number, number, number];

/** Proporsi tubuh per jenis kelamin. Diterapkan lewat skala bagian-bagian, jadi bisa berganti saat runtime. */
interface GenderShape {
  shoulderX: number;
  armThick: number;
  legThick: number;
  legX: number;
  chest: V3;
  jacket: V3;
  pelvis: V3;
  beltX: number;
  hipX: number;
  neck: number;
  head: number;
  pad: number;
}

const SHAPES: Record<Gender, GenderShape> = {
  male: {
    shoulderX: 0.335,
    armThick: 1.0,
    legThick: 1.0,
    legX: 0.155,
    chest: [1.2, 1, 0.84],
    jacket: [1.16, 1, 0.82],
    pelvis: [1.0, 1, 1.0],
    beltX: 1.05,
    hipX: 0.245,
    neck: 1.15,
    head: 1.0,
    pad: 1.15,
  },
  female: {
    shoulderX: 0.285,
    armThick: 0.86,
    legThick: 0.93,
    legX: 0.16,
    chest: [0.98, 1, 0.8],
    jacket: [0.94, 1, 0.78],
    pelvis: [1.12, 1, 1.04],
    beltX: 1.1,
    hipX: 0.262,
    neck: 0.85,
    head: 0.96,
    pad: 0.95,
  },
};

export function createExplorerCharacter(avatar: AvatarConfig, shadowTex: THREE.Texture): CharacterRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 16),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.5, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;
  root.add(shadow);

  // ---- materials ----
  const darkUnderMat = new THREE.MeshStandardMaterial({ color: '#1c1917', roughness: 0.78, metalness: 0.15 });
  const suitAccentMat = new THREE.MeshStandardMaterial({ color: avatar.suitColor, roughness: 0.42, metalness: 0.35 });
  const trimMat = new THREE.MeshStandardMaterial({ color: avatar.suitColor, roughness: 0.55, metalness: 0.3 });
  const metalTrimMat = new THREE.MeshStandardMaterial({ color: '#78716c', roughness: 0.3, metalness: 0.75 });
  const skinMat = new THREE.MeshStandardMaterial({ color: avatar.skinTone, roughness: 0.68, metalness: 0.02 });
  const hairMat = new THREE.MeshStandardMaterial({ color: avatar.hairColor, roughness: 0.85, metalness: 0.05 });
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: '#f5f5f4', roughness: 0.35 });
  const irisMat = new THREE.MeshBasicMaterial({ color: '#1e293b' });
  const lipMat = new THREE.MeshStandardMaterial({ color: '#8b4a42', roughness: 0.5 });
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: '#0ea5e9',
    roughness: 0.12,
    metalness: 0.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
    emissive: '#0369a1',
    emissiveIntensity: 0.25,
  });
  const lightMat = new THREE.MeshStandardMaterial({
    color: '#22d3ee',
    emissive: '#22d3ee',
    emissiveIntensity: 1.4,
    roughness: 0.3,
  });
  const baseSuitColor = new THREE.Color(avatar.suitColor);
  const TRIM_DARKEN = new THREE.Color('#0c0a09');

  // ---- legs (pivot di pinggul, y=0.9) ----
  const makeLeg = (): { leg: THREE.Group; limb: THREE.Group } => {
    const leg = new THREE.Group();
    leg.position.y = 0.9;
    const limb = new THREE.Group();
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.28, 6, 12), darkUnderMat);
    thigh.position.y = -0.22;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.28, 6, 12), suitAccentMat);
    shin.position.y = -0.62;
    const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.09, 0.06), trimMat);
    kneePad.position.set(0, -0.43, 0.075);
    limb.add(thigh, shin, kneePad);

    const bootCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.093, 0.1, 0.06, 12), trimMat);
    bootCuff.position.set(0, -0.76, 0);
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.3), metalTrimMat);
    boot.position.set(0, -0.83, 0.05);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.33), darkUnderMat);
    sole.position.set(0, -0.8825, 0.055);
    leg.add(limb, bootCuff, boot, sole);
    return { leg, limb };
  };
  const { leg: leftLeg, limb: leftLegLimb } = makeLeg();
  const { leg: rightLeg, limb: rightLegLimb } = makeLeg();

  // ---- torso ----
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 0.92;

  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.2, 14), darkUnderMat);
  pelvis.position.y = 0.05;
  const jacket = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.34, 8, 16), darkUnderMat);
  jacket.position.y = 0.35;
  // Dada menyempit ke pinggang: pria lebih lebar di bahu, wanita lebih ramping di pinggang.
  const chestPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.4, 16), suitAccentMat);
  chestPlate.position.set(0, 0.42, 0.01);
  const statusLight = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.012), lightMat);
  statusLight.position.set(0.09, 0.1, 0.2);
  chestPlate.add(statusLight);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 8, 16), suitAccentMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.66;
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.215, 0.028, 8, 24), trimMat);
  belt.rotation.x = Math.PI / 2;
  belt.position.y = 0.09;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.03), metalTrimMat);
  buckle.position.set(0, 0.09, 0.235);
  const pouchL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.07), trimMat);
  const pouchR = pouchL.clone();
  pouchL.position.set(-0.25, 0.05, 0.02);
  pouchR.position.set(0.25, 0.05, 0.02);

  // Ransel
  const packO2 = new THREE.Group();
  const packBody = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.2), metalTrimMat);
  packBody.position.set(0, 0.38, -0.22);
  const o2Tank = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.38, 10), suitAccentMat);
  o2Tank.position.set(0.09, 0.4, -0.32);
  const o2Tank2 = o2Tank.clone();
  o2Tank2.position.x = -0.09;
  packO2.add(packBody, o2Tank, o2Tank2);

  const packExpedition = new THREE.Group();
  const expFrame = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.28), metalTrimMat);
  expFrame.position.set(0, 0.42, -0.24);
  const expRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.46, 10), suitAccentMat);
  expRoll.rotation.z = Math.PI / 2;
  expRoll.position.set(0, 0.72, -0.24);
  packExpedition.add(expFrame, expRoll);

  const packScout = new THREE.Group();
  const scoutPack = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.28, 6, 10), suitAccentMat);
  scoutPack.position.set(0, 0.4, -0.2);
  packScout.add(scoutPack);

  const backShieldMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.24, 0.06, 6),
    new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.25, metalness: 0.7 })
  );
  backShieldMesh.rotation.x = Math.PI / 2;
  backShieldMesh.position.set(0, 0.4, -0.37);
  backShieldMesh.visible = false;

  // ---- arms (pivot di bahu) ----
  const makeArm = (): { arm: THREE.Group; limb: THREE.Group; pad: THREE.Mesh } => {
    const arm = new THREE.Group();
    arm.position.y = 0.58;
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), suitAccentMat);
    const limb = new THREE.Group();
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 6, 12), darkUnderMat);
    upper.position.y = -0.18;
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.22, 6, 12), metalTrimMat);
    forearm.position.y = -0.45;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.072, 0.06, 12), trimMat);
    cuff.position.y = -0.58;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), skinMat);
    hand.position.y = -0.65;
    limb.add(upper, forearm, cuff, hand);
    arm.add(pad, limb);
    return { arm, limb, pad };
  };
  const { arm: leftArm, limb: leftArmLimb, pad: leftPad } = makeArm();
  const { arm: rightArm, limb: rightArmLimb, pad: rightPad } = makeArm();

  // Alat di tangan kanan
  const toolMesh = new THREE.Group();
  toolMesh.position.set(0, -0.66, 0.08);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 8), metalTrimMat);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = 0.22;
  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.16, 0.22),
    new THREE.MeshStandardMaterial({ color: '#a8a29e', metalness: 0.7, roughness: 0.3 })
  );
  head.position.set(0, 0.04, 0.46);
  toolMesh.add(handle, head);
  toolMesh.visible = false;
  rightArm.add(toolMesh);

  // ---- kepala ----
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.72, 0);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 10), skinMat);
  neck.position.y = 0.04;
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), skinMat);
  cranium.scale.set(0.92, 1.06, 0.96);
  cranium.position.y = 0.23;

  const earL = new THREE.Mesh(new THREE.SphereGeometry(0.034, 8, 8), skinMat);
  earL.scale.set(0.5, 1, 0.8);
  earL.position.set(-0.155, 0.225, 0);
  const earR = earL.clone();
  earR.position.x = 0.155;

  // Mata: putih + iris, alis, hidung, mulut
  const eyeWhiteL = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), eyeWhiteMat);
  eyeWhiteL.scale.set(1, 0.85, 0.55);
  eyeWhiteL.position.set(-0.056, 0.245, 0.15);
  const eyeWhiteR = eyeWhiteL.clone();
  eyeWhiteR.position.x = 0.056;
  const irisL = new THREE.Mesh(new THREE.SphereGeometry(0.013, 8, 8), irisMat);
  irisL.position.set(-0.056, 0.245, 0.162);
  const irisR = irisL.clone();
  irisR.position.x = 0.056;

  const browL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.014), hairMat);
  browL.position.set(-0.056, 0.282, 0.152);
  browL.rotation.z = 0.12;
  const browR = browL.clone();
  browR.position.x = 0.056;
  browR.rotation.z = -0.12;

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 8), skinMat);
  nose.scale.set(0.9, 1.25, 1.1);
  nose.position.set(0, 0.215, 0.163);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.009, 0.012), lipMat);
  mouth.position.set(0, 0.172, 0.156);

  // Detail khusus: bulu mata + bibir lebih penuh (wanita), alis tebal + rahang (pria)
  const lashL = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.006, 0.01), irisMat);
  lashL.position.set(-0.058, 0.263, 0.156);
  lashL.rotation.z = 0.2;
  const lashR = lashL.clone();
  lashR.position.x = 0.058;
  lashR.rotation.z = -0.2;
  const lipFull = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.007, 0.01), lipMat);
  lipFull.position.set(0, 0.182, 0.155);
  const femaleFace = new THREE.Group();
  femaleFace.add(lashL, lashR, lipFull);

  const browThickL = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.008, 0.012), hairMat);
  browThickL.position.set(-0.056, 0.292, 0.15);
  const browThickR = browThickL.clone();
  browThickR.position.x = 0.056;
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 10), skinMat);
  jaw.scale.set(1.0, 0.62, 0.92);
  jaw.position.set(0, 0.145, 0.025);
  const maleFace = new THREE.Group();
  maleFace.add(browThickL, browThickR, jaw);

  // Kacamata pelindung di dahi (wajah tetap terlihat)
  const goggles = new THREE.Group();
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.178, 0.011, 6, 24), darkUnderMat);
  strap.rotation.x = Math.PI / 2;
  strap.position.set(0, 0.31, -0.005);
  const lensL = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.02, 14), lensMat);
  lensL.rotation.x = Math.PI / 2;
  lensL.position.set(-0.056, 0.31, 0.172);
  const lensR = lensL.clone();
  lensR.position.x = 0.056;
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.012), metalTrimMat);
  bridge.position.set(0, 0.31, 0.176);
  const rimL = new THREE.Mesh(new THREE.TorusGeometry(0.037, 0.007, 6, 14), metalTrimMat);
  rimL.position.set(-0.056, 0.31, 0.182);
  const rimR = rimL.clone();
  rimR.position.x = 0.056;
  goggles.add(strap, lensL, lensR, bridge, rimL, rimR);

  // Gaya rambut
  const hairShort = new THREE.Mesh(new THREE.SphereGeometry(0.182, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
  hairShort.position.set(0, 0.25, -0.02);
  hairShort.rotation.x = -0.22;

  const hairPonytail = new THREE.Group();
  const tailCap = hairShort.clone();
  const tailLock = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 10), hairMat);
  tailLock.position.set(0, 0.22, -0.2);
  tailLock.rotation.x = 0.85;
  hairPonytail.add(tailCap, tailLock);

  const hairBuzz = new THREE.Mesh(new THREE.SphereGeometry(0.175, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), hairMat);
  hairBuzz.position.set(0, 0.26, -0.01);

  const hairHood = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.75), suitAccentMat);
  hairHood.position.set(0, 0.23, -0.03);
  hairHood.rotation.x = -0.35;

  const hairLong = new THREE.Group();
  const longCap = hairShort.clone();
  const longBack = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), hairMat);
  longBack.scale.set(1.02, 1.55, 0.5);
  longBack.position.set(0, 0.1, -0.125);
  hairLong.add(longCap, longBack);

  const hairBun = new THREE.Group();
  const bunCap = hairShort.clone();
  const bunBall = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 10), hairMat);
  bunBall.position.set(0, 0.4, -0.1);
  hairBun.add(bunCap, bunBall);

  const hairBraid = new THREE.Group();
  const braidCap = hairShort.clone();
  const braidRope = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.3, 6, 10), hairMat);
  braidRope.position.set(0, 0.04, -0.19);
  braidRope.rotation.x = 0.12;
  const braidTie = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 8), trimMat);
  braidTie.position.set(0, -0.14, -0.2);
  hairBraid.add(braidCap, braidRope, braidTie);

  const breathPuff = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 6, 6),
    new THREE.MeshBasicMaterial({ color: '#e2e8f0', transparent: true, opacity: 0.0 })
  );
  breathPuff.position.set(0, 0.17, 0.25);

  headGroup.add(
    neck, cranium, earL, earR,
    eyeWhiteL, eyeWhiteR, irisL, irisR, browL, browR, nose, mouth,
    femaleFace, maleFace, goggles,
    hairShort, hairPonytail, hairBuzz, hairHood, hairLong, hairBun, hairBraid,
    breathPuff
  );
  torsoGroup.add(
    pelvis, jacket, chestPlate, collar, belt, buckle, pouchL, pouchR,
    packO2, packExpedition, packScout, backShieldMesh,
    leftArm, rightArm, headGroup
  );
  bodyPivot.add(leftLeg, rightLeg, torsoGroup);

  bodyPivot.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
  });

  const applyShape = (g: Gender) => {
    const s = SHAPES[g];
    leftLeg.position.x = -s.legX;
    rightLeg.position.x = s.legX;
    leftLegLimb.scale.set(s.legThick, 1, s.legThick);
    rightLegLimb.scale.set(s.legThick, 1, s.legThick);

    leftArm.position.x = -s.shoulderX;
    rightArm.position.x = s.shoulderX;
    leftArmLimb.scale.set(s.armThick, 1, s.armThick);
    rightArmLimb.scale.set(s.armThick, 1, s.armThick);
    leftPad.scale.set(s.pad, s.pad * 0.75, s.pad);
    rightPad.scale.set(s.pad, s.pad * 0.75, s.pad);

    chestPlate.scale.set(...s.chest);
    jacket.scale.set(...s.jacket);
    pelvis.scale.set(...s.pelvis);
    belt.scale.set(s.beltX, 1, 1);
    pouchL.position.x = -s.hipX;
    pouchR.position.x = s.hipX;
    neck.scale.set(s.neck, 1, s.neck);
    headGroup.scale.setScalar(s.head);

    femaleFace.visible = g === 'female';
    maleFace.visible = g === 'male';
    lipMat.color.set(g === 'female' ? '#a8504c' : '#7a4238');
  };

  const refreshSuitColors = (grime = 0) => {
    suitAccentMat.color.copy(baseSuitColor).lerp(new THREE.Color('#292524'), grime);
    trimMat.color.copy(baseSuitColor).lerp(TRIM_DARKEN, 0.45 + grime * 0.3);
  };

  const applyAppearance = (cfg: AvatarConfig) => {
    const buildWidth = cfg.build === 'slim' ? 0.9 : cfg.build === 'athletic' ? 1.12 : 1.0;
    const h = cfg.height || 1.0;
    bodyPivot.scale.set(h * buildWidth, h, h * buildWidth);
    skinMat.color.set(cfg.skinTone);
    hairMat.color.set(cfg.hairColor);
    baseSuitColor.set(cfg.suitColor);
    refreshSuitColors();
    applyShape(cfg.gender === 'female' ? 'female' : 'male');

    const hs = cfg.hairStyle || 'short';
    hairShort.visible = hs === 'short';
    hairPonytail.visible = hs === 'ponytail';
    hairBuzz.visible = hs === 'buzz';
    hairHood.visible = hs === 'hood';
    hairLong.visible = hs === 'long';
    hairBun.visible = hs === 'bun';
    hairBraid.visible = hs === 'braid';

    packO2.visible = cfg.packStyle === 'o2_pack' || !cfg.packStyle;
    packExpedition.visible = cfg.packStyle === 'expedition';
    packScout.visible = cfg.packStyle === 'scout';
  };

  const setEquipmentVisuals = (toolId: string | null, hasShield: boolean) => {
    toolMesh.visible = Boolean(toolId);
    if (toolId === 'obsidian_pick') (head.material as THREE.MeshStandardMaterial).color.set('#6366f1');
    else if (toolId === 'meteor_drill') (head.material as THREE.MeshStandardMaterial).color.set('#38bdf8');
    else (head.material as THREE.MeshStandardMaterial).color.set('#a8a29e');
    backShieldMesh.visible = hasShield;
  };

  const setSootAmount = (soot: number) => {
    refreshSuitColors(Math.max(0, Math.min(0.65, soot * 0.65)));
  };

  applyAppearance(avatar);

  return {
    root,
    bodyPivot,
    torsoGroup,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    headGroup,
    toolMesh,
    backShieldMesh,
    breathPuff,
    applyAppearance,
    setEquipmentVisuals,
    setSootAmount,
  };
}
