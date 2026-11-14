import * as THREE from 'three';
import type { AvatarConfig } from '../config';

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

  const darkUnderMat = new THREE.MeshStandardMaterial({ color: '#1c1917', roughness: 0.78, metalness: 0.15 });
  const suitAccentMat = new THREE.MeshStandardMaterial({ color: avatar.suitColor, roughness: 0.42, metalness: 0.35 });
  const metalTrimMat = new THREE.MeshStandardMaterial({ color: '#78716c', roughness: 0.3, metalness: 0.75 });
  const skinMat = new THREE.MeshStandardMaterial({ color: avatar.skinTone, roughness: 0.68, metalness: 0.02 });
  const hairMat = new THREE.MeshStandardMaterial({ color: avatar.hairColor, roughness: 0.85, metalness: 0.05 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: '#0f172a' });
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: '#0f172a',
    roughness: 0.12,
    metalness: 0.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });

  // Articulated ~7.5-head humanoid legs using rounded CapsuleGeometry
  const makeLeg = (xOff: number): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(xOff, 0.9, 0);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.28, 6, 8), darkUnderMat);
    thigh.position.y = -0.22;
    const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.28, 6, 8), suitAccentMat);
    shin.position.y = -0.62;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.3), metalTrimMat);
    boot.position.set(0, -0.83, 0.05);
    leg.add(thigh, shin, boot);
    return leg;
  };
  const leftLeg = makeLeg(-0.16);
  const rightLeg = makeLeg(0.16);

  // Torso group for forward sprint lean & waist articulation
  const torsoGroup = new THREE.Group();
  torsoGroup.position.y = 0.92;

  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.19, 0.2, 10), darkUnderMat);
  pelvis.position.y = 0.05;
  const jacket = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.34, 8, 12), darkUnderMat);
  jacket.position.y = 0.35;
  jacket.scale.set(1.12, 1.0, 0.8);
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.32), suitAccentMat);
  chestPlate.position.set(0, 0.42, 0.02);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.04, 6, 12), suitAccentMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.66;

  // Backpack variants
  const packO2 = new THREE.Group();
  const packBody = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.46, 0.2), metalTrimMat);
  packBody.position.set(0, 0.38, -0.22);
  const o2Tank = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.38, 8), suitAccentMat);
  o2Tank.position.set(0.09, 0.4, -0.32);
  const o2Tank2 = o2Tank.clone();
  o2Tank2.position.x = -0.09;
  packO2.add(packBody, o2Tank, o2Tank2);

  const packExpedition = new THREE.Group();
  const expFrame = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.56, 0.28), metalTrimMat);
  expFrame.position.set(0, 0.42, -0.24);
  const expRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.46, 8), suitAccentMat);
  expRoll.rotation.z = Math.PI / 2;
  expRoll.position.set(0, 0.72, -0.24);
  packExpedition.add(expFrame, expRoll);

  const packScout = new THREE.Group();
  const scoutPack = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.28, 6, 8), suitAccentMat);
  scoutPack.position.set(0, 0.4, -0.2);
  packScout.add(scoutPack);

  // Back-mounted heat shield visual
  const backShieldMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.24, 0.06, 6),
    new THREE.MeshStandardMaterial({ color: '#f97316', roughness: 0.25, metalness: 0.7 })
  );
  backShieldMesh.rotation.x = Math.PI / 2;
  backShieldMesh.position.set(0, 0.4, -0.37);
  backShieldMesh.visible = false;

  // Articulated arms with hands
  const makeArm = (xOff: number): THREE.Group => {
    const arm = new THREE.Group();
    arm.position.set(xOff, 0.58, 0);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 8), suitAccentMat);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.22, 6, 8), darkUnderMat);
    upper.position.y = -0.18;
    const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.22, 6, 8), metalTrimMat);
    forearm.position.y = -0.45;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 8), skinMat);
    hand.position.y = -0.64;
    arm.add(shoulder, upper, forearm, hand);
    return arm;
  };
  const leftArm = makeArm(-0.32);
  const rightArm = makeArm(0.32);

  // Right-hand equipped tool attachment
  const toolMesh = new THREE.Group();
  toolMesh.position.set(0, -0.66, 0.08);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.56, 6), metalTrimMat);
  handle.rotation.x = Math.PI / 2;
  handle.position.z = 0.22;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.22), new THREE.MeshStandardMaterial({ color: '#a8a29e', metalness: 0.7, roughness: 0.3 }));
  head.position.set(0, 0.04, 0.46);
  toolMesh.add(handle, head);
  toolMesh.visible = false;
  rightArm.add(toolMesh);

  // Head + face details + hair styles + hood + breath puff
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.72, 0);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.14, 8), skinMat);
  neck.position.y = 0.04;
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 12), skinMat);
  cranium.scale.set(0.92, 1.06, 0.96);
  cranium.position.y = 0.23;

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), eyeMat);
  eyeL.position.set(-0.055, 0.24, 0.148);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.055;

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.09, 0.14), visorMat);
  visor.position.set(0, 0.24, 0.12);

  const hairShort = new THREE.Mesh(new THREE.SphereGeometry(0.182, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
  hairShort.position.set(0, 0.25, -0.02);
  hairShort.rotation.x = -0.22;

  const hairPonytail = new THREE.Group();
  const tailCap = hairShort.clone();
  const tailLock = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 8), hairMat);
  tailLock.position.set(0, 0.22, -0.2);
  tailLock.rotation.x = 0.85;
  hairPonytail.add(tailCap, tailLock);

  const hairBuzz = new THREE.Mesh(new THREE.SphereGeometry(0.175, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), hairMat);
  hairBuzz.position.set(0, 0.26, -0.01);

  const hairHood = new THREE.Mesh(new THREE.SphereGeometry(0.21, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.75), suitAccentMat);
  hairHood.position.set(0, 0.23, -0.03);
  hairHood.rotation.x = -0.35;

  const breathPuff = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 6, 6),
    new THREE.MeshBasicMaterial({ color: '#e2e8f0', transparent: true, opacity: 0.0 })
  );
  breathPuff.position.set(0, 0.17, 0.25);

  headGroup.add(neck, cranium, eyeL, eyeR, visor, hairShort, hairPonytail, hairBuzz, hairHood, breathPuff);
  torsoGroup.add(pelvis, jacket, chestPlate, collar, packO2, packExpedition, packScout, backShieldMesh, leftArm, rightArm, headGroup);
  bodyPivot.add(leftLeg, rightLeg, torsoGroup);

  bodyPivot.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) obj.castShadow = true;
  });

  const baseSuitColor = new THREE.Color(avatar.suitColor);

  const applyAppearance = (cfg: AvatarConfig) => {
    const buildWidth = cfg.build === 'slim' ? 0.9 : cfg.build === 'athletic' ? 1.12 : 1.0;
    const h = cfg.height || 1.0;
    bodyPivot.scale.set(h * buildWidth, h, h * buildWidth);
    skinMat.color.set(cfg.skinTone);
    hairMat.color.set(cfg.hairColor);
    baseSuitColor.set(cfg.suitColor);
    suitAccentMat.color.copy(baseSuitColor);

    hairShort.visible = cfg.hairStyle === 'short' || !cfg.hairStyle;
    hairPonytail.visible = cfg.hairStyle === 'ponytail';
    hairBuzz.visible = cfg.hairStyle === 'buzz';
    hairHood.visible = cfg.hairStyle === 'hood';

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
    const grime = Math.max(0, Math.min(0.65, soot * 0.65));
    suitAccentMat.color.copy(baseSuitColor).lerp(new THREE.Color('#292524'), grime);
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
