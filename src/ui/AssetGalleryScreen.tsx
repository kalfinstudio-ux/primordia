import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ASSET_FILES,
  ASSET_ROLES,
  MODELS_DIR,
  assetFormat,
  assetUrl,
  assetWarnings,
  isWebLoadable,
  sanitizeAssetFile,
} from '../game/data/assets';
import { setScreen } from '../game/core/state';
import { detectSoftwareWebGL } from '../game/utils/device';
import { getAssignments, setAssignment } from '../game/utils/assetPrefs';
import { t } from '../game/utils/i18n';

type Status = 'idle' | 'loading' | 'ready' | 'error' | 'convert';

interface ModelStats {
  bytes: number | null;
  triangles: number;
  meshes: number;
  textures: number;
  height: number;
  clipNames: string[];
}

interface Runtime {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  grid: THREE.GridHelper;
  model: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null;
  action: THREE.AnimationAction | null;
  clips: THREE.AnimationClip[];
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of mats) {
      if (!m) continue;
      for (const v of Object.values(m as unknown as Record<string, unknown>)) {
        if (v && (v as THREE.Texture).isTexture) (v as THREE.Texture).dispose();
      }
      m.dispose();
    }
  });
}

function formatBytes(b: number | null): string {
  if (b === null) return '?';
  return b >= 1048576 ? `${(b / 1048576).toFixed(2)} MB` : `${Math.round(b / 1024)} KB`;
}

export function AssetGalleryScreen() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const rt = useRef<Runtime | null>(null);

  const [files, setFiles] = useState<string[]>(() => ASSET_FILES.map((a) => a.file));
  const [selected, setSelected] = useState<string | null>(() => ASSET_FILES[0]?.file ?? null);
  const [status, setStatus] = useState<Status>('idle');
  const [stats, setStats] = useState<ModelStats | null>(null);
  const [activeClip, setActiveClip] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<Record<string, string>>(() => getAssignments());
  const [addText, setAddText] = useState('');
  const [addError, setAddError] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── Penampil 3D (dibuat sekali) ──
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const soft = detectSoftwareWebGL();
    const renderer = new THREE.WebGLRenderer({ antialias: !soft, alpha: true });
    renderer.setPixelRatio(soft ? 1 : Math.min(window.devicePixelRatio || 1, 1.5));
    const w = el.clientWidth || 320;
    const h = el.clientHeight || 260;
    renderer.setSize(w, h);
    el.innerHTML = '';
    el.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'none';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, w / h, 0.05, 200);
    camera.position.set(0, 1.4, 4);
    scene.add(new THREE.HemisphereLight('#ffe2c8', '#2b150e', 1.6));
    const key = new THREE.DirectionalLight('#ffb37a', 2.2);
    key.position.set(3, 5, 4);
    scene.add(key);
    const grid = new THREE.GridHelper(4, 8, '#57534e', '#292524');
    scene.add(grid);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 1, 0);

    const runtime: Runtime = { scene, camera, controls, grid, model: null, mixer: null, action: null, clips: [] };
    rt.current = runtime;

    const clock = new THREE.Clock();
    let raf = 0;
    const tick = () => {
      runtime.mixer?.update(clock.getDelta());
      controls.update();
      renderer.render(scene, camera);
      raf = soft ? window.setTimeout(tick, 120) : requestAnimationFrame(tick);
    };
    tick();

    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth || w;
      const nh = el.clientHeight || h;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(raf);
      ro.disconnect();
      controls.dispose();
      if (runtime.model) disposeObject(runtime.model);
      renderer.dispose();
      el.innerHTML = '';
      rt.current = null;
    };
  }, []);

  const clearModel = useCallback(() => {
    const r = rt.current;
    if (!r) return;
    r.mixer?.stopAllAction();
    r.mixer = null;
    r.action = null;
    r.clips = [];
    if (r.model) {
      r.scene.remove(r.model);
      disposeObject(r.model);
      r.model = null;
    }
  }, []);

  // ── Muat model terpilih ──
  useEffect(() => {
    const r = rt.current;
    if (!r || !selected) return;
    let cancelled = false;
    clearModel();
    setStats(null);
    setActiveClip(null);

    if (!isWebLoadable(assetFormat(selected))) {
      setStatus('convert');
      return;
    }
    setStatus('loading');

    void (async () => {
      try {
        const res = await fetch(assetUrl(selected));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const gltf = await new GLTFLoader().parseAsync(buf, MODELS_DIR);
        if (cancelled || !rt.current) {
          disposeObject(gltf.scene);
          return;
        }
        const model = gltf.scene;
        let triangles = 0;
        let meshes = 0;
        const textures = new Set<THREE.Texture>();
        model.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          meshes++;
          if ((o as THREE.SkinnedMesh).isSkinnedMesh) o.frustumCulled = false;
          const g = mesh.geometry;
          triangles += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const m of mats) {
            for (const v of Object.values((m || {}) as unknown as Record<string, unknown>)) {
              if (v && (v as THREE.Texture).isTexture) textures.add(v as THREE.Texture);
            }
          }
        });

        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.01);
        const dist = (maxDim / (2 * Math.tan((r.camera.fov * Math.PI) / 360))) * 1.7;
        r.camera.position.set(center.x, center.y + size.y * 0.1, center.z + dist);
        r.camera.near = Math.max(0.01, dist / 100);
        r.camera.far = dist * 30;
        r.camera.updateProjectionMatrix();
        r.controls.target.copy(center);
        r.controls.update();
        r.grid.position.y = box.min.y;
        r.grid.scale.setScalar(Math.max(0.25, maxDim / 4));

        r.scene.add(model);
        r.model = model;
        r.clips = gltf.animations;
        if (gltf.animations.length > 0) {
          r.mixer = new THREE.AnimationMixer(model);
          const first = gltf.animations.find((c) => /idle|stand|breath/i.test(c.name)) ?? gltf.animations[0];
          r.action = r.mixer.clipAction(first);
          r.action.play();
          setActiveClip(first.name);
        }

        setStats({
          bytes: buf.byteLength,
          triangles: Math.round(triangles),
          meshes,
          textures: textures.size,
          height: size.y,
          clipNames: gltf.animations.map((c) => c.name || '(tanpa nama)'),
        });
        setStatus('ready');
      } catch {
        if (!cancelled) setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selected, clearModel]);

  const playClip = (name: string) => {
    const r = rt.current;
    if (!r?.mixer) return;
    const clip = r.clips.find((c) => (c.name || '(tanpa nama)') === name);
    if (!clip) return;
    r.action?.fadeOut(0.15);
    r.action = r.mixer.clipAction(clip).reset().fadeIn(0.15).play();
    setActiveClip(name);
  };

  const assign = (role: string, file: string | null) => {
    setAssignments(setAssignment(role, file));
    setSaved(role === 'player');
  };

  const addFile = () => {
    const safe = sanitizeAssetFile(addText);
    if (!safe) {
      setAddError(true);
      return;
    }
    setAddError(false);
    setFiles((prev) => (prev.includes(safe) ? prev : [...prev, safe]));
    setSelected(safe);
    setAddText('');
  };

  const warnings = selected && (stats || status === 'convert')
    ? assetWarnings({
        file: selected,
        bytes: stats?.bytes ?? null,
        triangles: stats?.triangles ?? 0,
        clipNames: stats?.clipNames ?? [],
      })
    : [];

  return (
    <main className="fixed inset-0 z-40 flex flex-col" style={{ backgroundColor: 'rgba(11, 9, 8, 0.96)' }}>
      <header className="flex items-center justify-between border-b border-stone-800 px-4 py-3">
        <h2 className="font-display text-xl sm:text-2xl font-semibold text-stone-100">{t('assets.title')}</h2>
        <button
          type="button"
          onClick={() => setScreen('menu')}
          className="min-h-[40px] rounded-lg bg-orange-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-orange-500"
        >
          {t('assets.close')}
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        <p className="text-xs text-stone-400">{t('assets.hint')}</p>

        <div className="flex flex-wrap gap-1.5">
          {files.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setSelected(f)}
              className={`max-w-full truncate rounded-lg border px-2.5 py-1.5 text-xs ${
                selected === f
                  ? 'border-orange-500 bg-orange-950/60 text-orange-200'
                  : 'border-stone-800 bg-stone-900/90 text-stone-300 hover:border-stone-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="relative">
          <div
            ref={mountRef}
            className="h-[40dvh] max-h-[360px] min-h-[220px] w-full overflow-hidden rounded-xl border border-stone-800"
            style={{ backgroundColor: 'rgba(24, 18, 15, 0.9)' }}
          />
          {(status === 'loading' || status === 'error' || status === 'convert') && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-stone-300">
              {status === 'loading' ? t('assets.loading') : status === 'error' ? t('assets.loadFail') : t('assets.convert')}
            </div>
          )}
        </div>

        {stats && (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-stone-300 sm:grid-cols-3">
            <div><dt className="text-stone-500">{t('assets.size')}</dt><dd>{formatBytes(stats.bytes)}</dd></div>
            <div><dt className="text-stone-500">{t('assets.tris')}</dt><dd>{stats.triangles.toLocaleString('id-ID')}</dd></div>
            <div><dt className="text-stone-500">{t('assets.meshes')}</dt><dd>{stats.meshes}</dd></div>
            <div><dt className="text-stone-500">{t('assets.textures')}</dt><dd>{stats.textures}</dd></div>
            <div><dt className="text-stone-500">{t('assets.height')}</dt><dd>{stats.height.toFixed(2)} m</dd></div>
          </dl>
        )}

        {stats && (
          <div className="text-xs text-stone-300">
            <div className="mb-1 text-stone-500">{t('assets.clips')}</div>
            {stats.clipNames.length === 0 ? (
              <span>{t('assets.none')}</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {stats.clipNames.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => playClip(c)}
                    className={`rounded border px-2 py-1 ${
                      activeClip === c ? 'border-sky-500 bg-sky-950/60 text-sky-200' : 'border-stone-800 bg-stone-900/90 text-stone-300'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {(stats || status === 'convert') && (
          <div className="rounded-lg border border-stone-800 bg-stone-900/70 p-2.5 text-xs">
            <div className="mb-1 font-semibold text-amber-300">{t('assets.warnings')}</div>
            {warnings.length === 0 ? (
              <div className="text-emerald-300">{t('assets.allGood')}</div>
            ) : (
              <ul className="list-disc space-y-0.5 pl-4 text-stone-300">
                {warnings.map((w) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>
        )}

        {selected && isWebLoadable(assetFormat(selected)) && (
          <div className="space-y-1.5">
            <div className="text-xs text-stone-500">{t('assets.roles')}</div>
            <div className="flex flex-wrap gap-1.5">
              {ASSET_ROLES.map((role) => {
                const on = assignments[role.id] === selected;
                return (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => assign(role.id, on ? null : selected)}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs ${
                      on
                        ? 'border-emerald-500 bg-emerald-950/60 text-emerald-200'
                        : 'border-stone-800 bg-stone-900/90 text-stone-300 hover:border-stone-700'
                    }`}
                  >
                    {on ? '✓ ' : ''}{role.label}
                    <span className="block text-[10px] text-stone-500">
                      {role.wired ? t('assets.wired') : t('assets.notWired')}
                    </span>
                  </button>
                );
              })}
            </div>
            {saved && <p className="text-[11px] text-amber-300">{t('assets.appliesNext')}</p>}
          </div>
        )}

        {Object.keys(assignments).length > 0 && (
          <div className="text-xs text-stone-300">
            <div className="mb-1 flex items-center justify-between text-stone-500">
              <span>{t('assets.current')}</span>
              {assignments.player && (
                <button type="button" onClick={() => assign('player', null)} className="text-orange-300 underline">
                  {t('assets.reset')}
                </button>
              )}
            </div>
            <ul className="space-y-0.5">
              {ASSET_ROLES.filter((r) => assignments[r.id]).map((r) => (
                <li key={r.id}>{r.label}: <span className="text-stone-100">{assignments[r.id]}</span></li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs text-stone-500" htmlFor="asset-add">{t('assets.addFile')}</label>
          <div className="flex gap-1.5">
            <input
              id="asset-add"
              value={addText}
              onChange={(e) => { setAddText(e.target.value); setAddError(false); }}
              onKeyDown={(e) => { if (e.key === 'Enter') addFile(); }}
              placeholder="contoh: Cave.glb"
              className="min-h-[40px] flex-1 rounded-lg border border-stone-800 bg-stone-900 px-2.5 text-sm text-stone-100"
            />
            <button
              type="button"
              onClick={addFile}
              className="min-h-[40px] rounded-lg border border-stone-700 bg-stone-800 px-3 text-sm text-stone-100 hover:bg-stone-700"
            >
              {t('assets.add')}
            </button>
          </div>
          {addError && <p className="text-[11px] text-red-400">{t('assets.invalidName')}</p>}
        </div>
      </div>
    </main>
  );
}
