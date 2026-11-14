import * as THREE from 'three';
import type { AvatarConfig } from '../config';

export interface CharacterRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  headGroup: THREE.Group;
  applyAppearance: (avatar: AvatarConfig) => void;
}

export function createExplorerCharacter(avatar: AvatarConfig, shadowTex: THREE.Texture): CharacterRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  // Contact shadow disc grounded at y = 0.02
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
  const visorMat = new THREE.MeshPhysicalMaterial({
    color: '#0f172a',
    roughness: 0.12,
    metalness: 0.45,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });

  // Articulated legs (pivoted at hip y = 0.88)
  const makeLeg = (xOff: number): THREE.Group => {
    const leg = new THREE.Group();
    leg.position.set(xOff, 0.88, 0);
    const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.46, 8), darkUnderMat);
    thigh.position.y = -0.22;
    const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.095, 0.44, 8), suitAccentMat);
    shin.position.y = -0.62;
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.3), metalTrimMat);
    boot.position.set(0, -0.8, 0.05);
    leg.add(thigh, shin, boot);
    return leg;
  };
  const leftLeg = makeLeg(-0.18);
  const rightLeg = makeLeg(0.18);

  // Torso + armored chestplate + O2 survival backpack
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.23, 0.68, 10), darkUnderMat);
  torso.position.y = 1.22;
  const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.42, 0.34), suitAccentMat);
  chestPlate.position.set(0, 1.32, 0.02);

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 0.22), metalTrimMat);
  backpack.position.set(0, 1.32, -0.24);
  const o2Tank = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.38, 8), suitAccentMat);
  o2Tank.position.set(0.1, 1.35, -0.34);

  // Articulated arms (pivoted at shoulder y = 1.48)
  const makeArm = (xOff: number): THREE.Group => {
    const arm = new THREE.Group();
    arm.position.set(xOff, 1.48, 0);
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), suitAccentMat);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.36, 8), darkUnderMat);
    upper.position.y = -0.18;
    const forearm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.34, 8), metalTrimMat);
    forearm.position.y = -0.5;
    const glove = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), skinMat);
    glove.position.y = -0.68;
    arm.add(shoulder, upper, forearm, glove);
    return arm;
  };
  const leftArm = makeArm(-0.35);
  const rightArm = makeArm(0.35);

  // Head + Hair + Rebreather Visor
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.66, 0);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.14, 8), skinMat);
  neck.position.y = 0.04;
  const cranium = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skinMat);
  cranium.position.y = 0.22;
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
  hairCap.position.set(0, 0.24, -0.02);
  hairCap.rotation.x = -0.22;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.12, 0.16), visorMat);
  visor.position.set(0, 0.21, 0.12);
  headGroup.add(neck, cranium, hairCap, visor);

  bodyPivot.add(leftLeg, rightLeg, torso, chestPlate, backpack, o2Tank, leftArm, rightArm, headGroup);

  bodyPivot.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      obj.castShadow = true;
    }
  });

  const applyAppearance = (cfg: AvatarConfig) => {
    bodyPivot.scale.setScalar(cfg.height || 1.0);
    skinMat.color.set(cfg.skinTone);
    hairMat.color.set(cfg.hairColor);
    suitAccentMat.color.set(cfg.suitColor);
  };

  applyAppearance(avatar);

  return {
    root,
    bodyPivot,
    leftLeg,
    rightLeg,
    leftArm,
    rightArm,
    headGroup,
    applyAppearance,
  };
}
