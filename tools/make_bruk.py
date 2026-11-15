#!/usr/bin/env python3
"""
Bruk, penjaga basal — pembuat model 3D NPC tingkat 2 (tanpa Blender, tanpa internet, tanpa tekstur).

Menghasilkan public/play/models/primordia_bruk.glb : golem basal bertanduk ±3,3 m, flat-shaded, hanya warna
material + emissive (anggaran: <= 3.000 segitiga, <= 500 KB). Karya asli PRIMORDIA (CC0).

Pakai:
  python3 tools/make_bruk.py                       # tulis .glb + cetak statistik
  python3 tools/make_bruk.py --preview /tmp/prev   # + PNG pratinjau 5 tingkat x 3 sudut (butuh numpy, PIL, scipy)
  python3 tools/make_bruk.py --preview /tmp/prev --poses poses.json   # pakai pose dari logika brukBehavior.ts

Arah hadap +Z, kiri Bruk = +X, kaki di y=0, Y atas (sama dengan make_character.py).

Node (nama dipakai BrukBody di M3 untuk menggerakkan pose):
  Bruk (akar)
  ├─ Hips          pinggul + kaki-kaki (statis; duduk = putar LegL/LegR)
  │   ├─ LegL / LegR      pivot di pinggul
  │   └─ Torso            pivot di pinggul: rotation.x = lean
  │        ├─ Head        pivot di leher: rotation.y = headYaw
  │        │    └─ Eye    mata hidup (scale.y = eyeOpen)
  │        └─ ArmL / ArmR pivot di bahu: rotation.x = -0.9*arms, rotation.z = ±0.4*arms
Material (nama dipakai M3 untuk mengubah warna/intensitas per tingkat kepercayaan):
  Lava (retakan + rongga mulut)  : emissive digerakkan pose.crackColor/glow
  Eye  (mata amber hidup)        : emissive digerakkan pose.eyeColor/eyeGlow
  Basalt, BasaltDark, Crystal, Gold, Fang, EyeDead : tetap
"""
import json, math, os, struct, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'public', 'play', 'models', 'primordia_bruk.glb')
MAX_TRIS = 3000
MAX_BYTES = 500 * 1024

# ───────────────────────────── material (sRGB hex, emissive 0..1) ─────────────────────────────
MATS = {
    'Basalt':     dict(color=(0x4a, 0x50, 0x57), rough=0.92, metal=0.05, emissive=(0, 0, 0)),
    'BasaltDark': dict(color=(0x2b, 0x2e, 0x33), rough=0.90, metal=0.08, emissive=(0, 0, 0)),
    'Crystal':    dict(color=(0x2f, 0x8f, 0x86), rough=0.35, metal=0.10, emissive=(0.04, 0.22, 0.20)),
    'Gold':       dict(color=(0xb8, 0x96, 0x2e), rough=0.45, metal=0.55, emissive=(0, 0, 0)),
    'Fang':       dict(color=(0xd8, 0xce, 0xb4), rough=0.6, metal=0.0, emissive=(0, 0, 0)),
    'Lava':       dict(color=(0x18, 0x0a, 0x06), rough=0.8, metal=0.0, emissive=(1.0, 0.38, 0.1)),
    'Eye':        dict(color=(0x20, 0x10, 0x04), rough=0.3, metal=0.0, emissive=(1.0, 0.69, 0.18)),
    'EyeDead':    dict(color=(0x16, 0x10, 0x0e), rough=0.7, metal=0.0, emissive=(0, 0, 0)),
}
MAT_ORDER = list(MATS)

# ───────────────────────────── geometri dasar ─────────────────────────────
def rot(rx=0.0, ry=0.0, rz=0.0):
    cx, sx, cy, sy, cz, sz = math.cos(rx), math.sin(rx), math.cos(ry), math.sin(ry), math.cos(rz), math.sin(rz)
    Rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    Ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    Rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return Rz @ Ry @ Rx

def sgnpow(x, e):
    return np.sign(x) * np.abs(x) ** e

def orient(tris, centers):
    """Balik segitiga yang normalnya menghadap ke pusat. tris (N,3,3); centers (N,3) atau (3,)."""
    n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    cen = tris.mean(axis=1)
    flip = np.einsum('ij,ij->i', n, cen - centers) < 0
    out = tris.copy()
    out[flip] = tris[flip][:, [0, 2, 1]]
    return out

def drop_degenerate(tris, eps=1e-8):
    n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    return tris[np.linalg.norm(n, axis=1) > eps]

def grid_to_tris(G):
    """G: (R+1, S, 3) grid melingkar di sumbu kedua -> segitiga."""
    R1, S, _ = G.shape
    t = []
    for i in range(R1 - 1):
        for j in range(S):
            a, b, c, d = G[i, j], G[i + 1, j], G[i + 1, (j + 1) % S], G[i, (j + 1) % S]
            t.append([a, b, c]); t.append([a, c, d])
    return np.array(t)

def blob(center, radii, rings=8, segs=12, e=(0.8, 0.8), rough=0.0, seed=1, R=None):
    """Superellipsoid bergerigi (batu). e<1 = lebih kotak. rough = deformasi acak deterministik."""
    rng = np.random.RandomState(seed)
    rx, ry, rz = radii
    G = np.zeros((rings + 1, segs, 3))
    for i in range(rings + 1):
        phi = -math.pi / 2 + math.pi * i / rings
        cp, sp = sgnpow(math.cos(phi), e[0]), sgnpow(math.sin(phi), e[0])
        for j in range(segs):
            th = 2 * math.pi * j / segs
            x = rx * cp * sgnpow(math.cos(th), e[1])
            y = ry * sp
            z = rz * cp * sgnpow(math.sin(th), e[1])
            k = 1.0 if i in (0, rings) else 1.0 + rough * (rng.rand() * 2 - 1)
            G[i, j] = (x * k, y * k, z * k)
    if R is not None:
        G = G @ R.T
    G = G + np.array(center)
    tris = drop_degenerate(grid_to_tris(G))
    return orient(tris, np.array(center))

def tube(path, radii, sides=6, seed=0, rough=0.0, tip=True):
    """Tabung menyempit sepanjang jalur; ujung terakhir ditutup (kerucut bila radius akhir kecil)."""
    P = np.array(path, float)
    K = len(P)
    rng = np.random.RandomState(seed)
    T = np.zeros_like(P)
    for k in range(K):
        a, b = P[max(k - 1, 0)], P[min(k + 1, K - 1)]
        T[k] = (b - a) / (np.linalg.norm(b - a) + 1e-9)
    up = np.array([0, 0, 1.0]) if abs(T[0][2]) < 0.9 else np.array([1.0, 0, 0])
    N = np.cross(T[0], up); N /= np.linalg.norm(N)
    rings = []
    for k in range(K):
        N = N - T[k] * np.dot(N, T[k]); N /= np.linalg.norm(N)
        B = np.cross(T[k], N)
        ring = []
        for j in range(sides):
            a = 2 * math.pi * j / sides
            kk = 1.0 + rough * (rng.rand() * 2 - 1)
            ring.append(P[k] + (N * math.cos(a) + B * math.sin(a)) * radii[k] * kk)
        rings.append(ring)
    tris = []
    for k in range(K - 1):
        c = (P[k] + P[k + 1]) / 2
        for j in range(sides):
            a, b, c2, d = rings[k][j], rings[k][(j + 1) % sides], rings[k + 1][(j + 1) % sides], rings[k + 1][j]
            tris.append(orient(np.array([[a, b, c2], [a, c2, d]]), c))
    if tip:
        for j in range(sides):
            tris.append(orient(np.array([[rings[-1][j], rings[-1][(j + 1) % sides], P[-1] + T[-1] * radii[-1] * 0.6]]), P[-1]))
    out = np.concatenate(tris)
    return drop_degenerate(out)

def solid(verts, faces):
    V = np.array(verts, float)
    tris = []
    for f in faces:
        for k in range(1, len(f) - 1):
            tris.append([V[f[0]], V[f[k]], V[f[k + 1]]])
    return orient(np.array(tris), V.mean(axis=0))

def box(center, size, R=None):
    sx, sy, sz = [s / 2 for s in size]
    v = np.array([[x, y, z] for x in (-sx, sx) for y in (-sy, sy) for z in (-sz, sz)])
    if R is not None:
        v = v @ R.T
    v = v + np.array(center)
    f = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
    return solid(v, f)

def cone(base, tip, r, sides=4):
    base, tip = np.array(base, float), np.array(tip, float)
    ax = (tip - base) / np.linalg.norm(tip - base)
    h = np.array([0, 1.0, 0]) if abs(ax[1]) < 0.9 else np.array([1.0, 0, 0])
    u = np.cross(ax, h); u /= np.linalg.norm(u)
    w = np.cross(ax, u)
    ring = [base + (u * math.cos(2 * math.pi * j / sides) + w * math.sin(2 * math.pi * j / sides)) * r for j in range(sides)]
    t = []
    for j in range(sides):
        t.append([ring[j], ring[(j + 1) % sides], tip])
    for j in range(1, sides - 1):
        t.append([ring[0], ring[j], ring[j + 1]])
    return orient(np.array(t), (base + tip * 0.35) / 1.35)

# ───────────────────────────── raycast: tempelkan retakan/ fitur ke permukaan batu ─────────────────────────────
def raycast(tris, o, d):
    o, d = np.array(o, float), np.array(d, float)
    v0, v1, v2 = tris[:, 0], tris[:, 1], tris[:, 2]
    e1, e2 = v1 - v0, v2 - v0
    p = np.cross(d, e2)
    det = np.einsum('ij,ij->i', e1, p)
    ok = np.abs(det) > 1e-9
    inv = np.where(ok, 1.0 / np.where(ok, det, 1), 0)
    tv = o - v0
    u = np.einsum('ij,ij->i', tv, p) * inv
    q = np.cross(tv, e1)
    v = (q @ d) * inv
    t = np.einsum('ij,ij->i', e2, q) * inv
    hit = ok & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-6)
    if not hit.any():
        return None
    i = np.where(hit)[0][np.argmin(t[hit])]
    n = np.cross(e1[i], e2[i]); n /= np.linalg.norm(n)
    if np.dot(n, d) > 0:
        n = -n
    return o + d * t[i], n

AXES = {  # nama bidang -> (arah sinar, sumbu-2D a, sumbu-2D b, jarak awal)
    'front': (np.array([0, 0, -1.0]), 0, 1), 'back': (np.array([0, 0, 1.0]), 0, 1),
    'left': (np.array([-1.0, 0, 0]), 2, 1), 'right': (np.array([1.0, 0, 0]), 2, 1),
    'top': (np.array([0, -1.0, 0]), 0, 2),
}

def project_path(surf, plane, path2d, fixed, lift=0.03):
    """path2d: [(a,b)] pada bidang; fixed: koordinat sumbu ketiga tempat sinar dimulai (jauh di luar)."""
    d, ia, ib = AXES[plane]
    pts, nrm = [], []
    for a, b in path2d:
        o = np.zeros(3); o[ia] = a; o[ib] = b
        ax3 = 3 - ia - ib
        o[ax3] = -d[ax3] * 12.0
        h = raycast(surf, o, d)
        if h is None:
            continue
        pts.append(h[0] + h[1] * lift); nrm.append(h[1])
    return np.array(pts), np.array(nrm)

def ribbon(pts, nrm, w0=0.05, taper=True):
    """Pita datar mengikuti jalur di permukaan: tiap segmen = 2 segitiga."""
    n = len(pts)
    if n < 2:
        return np.zeros((0, 3, 3))
    L, Rr = [], []
    for k in range(n):
        a, b = pts[max(k - 1, 0)], pts[min(k + 1, n - 1)]
        t = (b - a) / (np.linalg.norm(b - a) + 1e-9)
        s = np.cross(t, nrm[k]); s /= np.linalg.norm(s) + 1e-9
        f = 1.0
        if taper:
            f = math.sin(math.pi * (k + 0.5) / n) ** 0.5 * 0.9 + 0.1
        L.append(pts[k] - s * w0 * f / 2); Rr.append(pts[k] + s * w0 * f / 2)
    tris = []
    for k in range(n - 1):
        c = (pts[k] + pts[k + 1]) / 2
        nn = nrm[k] + nrm[k + 1]
        for tri in ([L[k], Rr[k], Rr[k + 1]], [L[k], Rr[k + 1], L[k + 1]]):
            tr = np.array(tri)
            nf = np.cross(tr[1] - tr[0], tr[2] - tr[0])
            if np.dot(nf, nn) < 0:
                tr = tr[[0, 2, 1]]
            tris.append(tr)
    return drop_degenerate(np.array(tris), 1e-10)

def zigzag(start, ang, length, steps, jit, seed):
    rng = np.random.RandomState(seed)
    pts = [np.array(start, float)]
    a = ang
    for _ in range(steps):
        a += (rng.rand() * 2 - 1) * jit
        pts.append(pts[-1] + np.array([math.cos(a), math.sin(a)]) * length / steps)
    return [tuple(p) for p in pts]

# ───────────────────────────── perakitan scene ─────────────────────────────
class Scene:
    def __init__(self):
        self.nodes = {}       # nama -> dict(parent, pivot(world), parts{mat: [tris]})
        self.order = []

    def node(self, name, parent, pivot):
        self.nodes[name] = dict(parent=parent, pivot=np.array(pivot, float), parts={})
        self.order.append(name)

    def add(self, node, mat, tris):
        if len(tris) == 0:
            return
        self.nodes[node]['parts'].setdefault(mat, []).append(np.array(tris, float))

    def total_tris(self):
        return sum(len(t) for n in self.nodes.values() for ts in n['parts'].values() for t in ts)

def mirror_x(tris):
    t = tris.copy(); t[:, :, 0] *= -1
    return t[:, [0, 2, 1]]  # pertahankan arah normal setelah cermin

def scale_scene(S, k):
    for nd in S.nodes.values():
        nd['pivot'] = nd['pivot'] * k
        for m in nd['parts']:
            nd['parts'][m] = [t * k for t in nd['parts'][m]]

TARGET_HEIGHT = 3.3  # m, ujung tanduk (manusia 1,8 m)

def build():
    S = Scene()
    S.node('Bruk', None, (0, 0, 0))
    S.node('Hips', 'Bruk', (0, 1.2, 0))
    S.node('LegL', 'Hips', (0.50, 1.15, 0))
    S.node('LegR', 'Hips', (-0.50, 1.15, 0))
    S.node('Torso', 'Hips', (0, 1.25, 0))
    S.node('Head', 'Torso', (0, 2.50, 0.34))
    S.node('Eye', 'Head', (-0.30, 2.98, 1.30))
    S.node('ArmL', 'Torso', (1.28, 2.40, 0.0))
    S.node('ArmR', 'Torso', (-1.28, 2.40, 0.0))

    # ── pinggul & kaki (tebal, pendek: golem, bukan manusia) ──
    S.add('Hips', 'BasaltDark', blob((0, 1.28, 0), (0.86, 0.40, 0.60), 7, 12, (0.8, 0.8), 0.04, 11))
    for name, s_ in (('LegL', 1), ('LegR', -1)):
        thigh = tube([(0.52 * s_, 1.22, 0.0), (0.56 * s_, 0.75, 0.05), (0.56 * s_, 0.28, 0.0)], [0.44, 0.42, 0.37], 7, 20 + s_, 0.05, tip=False)
        foot = blob((0.58 * s_, 0.18, 0.18), (0.46, 0.20, 0.55), 5, 10, (0.7, 0.7), 0.05, 31 + s_)
        knee = blob((0.56 * s_, 0.78, 0.26), (0.34, 0.28, 0.26), 5, 9, (0.8, 0.8), 0.07, 41 + s_)
        S.add(name, 'Basalt', thigh); S.add(name, 'BasaltDark', foot); S.add(name, 'Basalt', knee)

    # ── dada, punggung, bahu (lebar), duri basalt di punggung untuk siluet jauh ──
    chest = blob((0, 1.98, 0.04), (1.04, 0.80, 0.70), 9, 14, (0.75, 0.7), 0.07, 5)
    hump = blob((0, 2.36, -0.40), (0.92, 0.56, 0.56), 6, 12, (0.8, 0.8), 0.09, 6)
    belly = blob((0, 1.52, 0.10), (0.84, 0.42, 0.58), 6, 12, (0.8, 0.8), 0.06, 7)
    S.add('Torso', 'Basalt', chest); S.add('Torso', 'Basalt', hump); S.add('Torso', 'Basalt', belly)
    shL = blob((1.20, 2.46, -0.02), (0.58, 0.44, 0.54), 6, 10, (0.8, 0.8), 0.09, 8)
    S.add('Torso', 'Basalt', shL); S.add('Torso', 'Basalt', mirror_x(shL))
    spikes = [((0.00, 2.70, -0.55), (0.00, 3.55, -0.95), 0.20), ((0.45, 2.62, -0.52), (0.72, 3.35, -0.85), 0.17), ((-0.45, 2.62, -0.52), (-0.72, 3.35, -0.85), 0.17),
              ((0.88, 2.78, -0.30), (1.28, 3.40, -0.40), 0.15), ((-0.88, 2.78, -0.30), (-1.28, 3.40, -0.40), 0.15),
              ((1.38, 2.78, 0.00), (1.72, 3.28, -0.05), 0.13), ((-1.38, 2.78, 0.00), (-1.72, 3.28, -0.05), 0.13)]
    for k, (b0, t0, r0) in enumerate(spikes):
        mid = tuple((np.array(b0) + np.array(t0)) / 2 + np.array([0, 0, 0.02]))
        S.add('Torso', 'BasaltDark', tube([b0, mid, t0], [r0, r0 * 0.62, r0 * 0.12], 5, 90 + k, 0.08))
    torso_surf = np.concatenate([chest, hump, belly, shL, mirror_x(shL)])

    # ── kepala: balok lebar di depan-atas dada (bungkuk), muka datar seperti topeng maskot ──
    skull = blob((0, 2.96, 0.68), (0.80, 0.56, 0.62), 9, 16, (0.6, 0.6), 0.035, 12)
    jaw = blob((0, 2.50, 1.00), (0.60, 0.20, 0.40), 5, 12, (0.7, 0.7), 0.04, 13)
    neck = blob((0, 2.50, 0.30), (0.56, 0.34, 0.44), 5, 10, (0.8, 0.8), 0.05, 14)
    S.add('Head', 'Basalt', skull); S.add('Head', 'BasaltDark', jaw); S.add('Head', 'BasaltDark', neck)
    head_surf = np.concatenate([skull, jaw])

    def zf(x, y, dz=0.0):
        h = raycast(head_surf, (x, y, 6.0), (0, 0, -1.0))
        return (h[0][2] if h else 1.2) + dz

    # alis berat (miring ke tengah-bawah = tatapan mengamati), mata, punggung hidung bersudut
    for s_ in (1, -1):
        S.add('Head', 'BasaltDark', box((0.34 * s_, 3.22, zf(0.34 * s_, 3.22, 0.03)), (0.56, 0.13, 0.30), rot(0.0, 0.0, -0.22 * s_)))
    S.add('Eye', 'Eye', blob((-0.30, 2.98, zf(-0.30, 2.98, -0.01)), (0.21, 0.10, 0.07), 4, 10, (0.9, 0.9), 0, 3))
    S.add('Eye', 'EyeDead', blob((-0.30, 2.98, zf(-0.30, 2.98, 0.045)), (0.03, 0.095, 0.03), 3, 6, (0.9, 0.9), 0, 5))  # pupil celah vertikal
    S.add('Head', 'EyeDead', blob((0.30, 2.98, zf(0.30, 2.98, -0.02)), (0.21, 0.11, 0.06), 4, 10, (0.9, 0.9), 0, 4))
    zt, zb = zf(0, 3.12, 0.03), zf(0, 2.64, 0.20)
    nose = solid(
        [(-0.05, 3.12, zt), (0.05, 3.12, zt), (-0.13, 2.64, zb - 0.02), (0.13, 2.64, zb - 0.02), (0.0, 3.10, zt + 0.07), (0.0, 2.62, zb + 0.10)],
        [[0, 1, 4], [0, 4, 5, 2], [1, 3, 5, 4], [2, 5, 3], [0, 2, 3, 1]])
    S.add('Head', 'BasaltDark', nose)
    # mulut lebar: celah bercahaya + taring gading (atas turun, bawah naik)
    ym = 2.52
    S.add('Head', 'Lava', box((0, ym, zf(0, ym, 0.0)), (0.78, 0.06, 0.07)))
    for k, x in enumerate((-0.30, -0.15, 0.0, 0.15, 0.30)):
        S.add('Head', 'Fang', cone((x, ym - 0.04, zf(x, ym, 0.045)), (x, ym + 0.15 + 0.04 * (k % 2), zf(x, ym, 0.07)), 0.042, 4))
    for k, x in enumerate((-0.225, -0.075, 0.075, 0.225)):
        S.add('Head', 'Fang', cone((x, ym + 0.04, zf(x, ym, 0.04)), (x, ym - 0.13 - 0.03 * (k % 2), zf(x, ym, 0.06)), 0.04, 4))
    # bongkah emas di pipi (identitas maskot)
    nug = blob((-0.62, 2.78, zf(-0.62, 2.78, -0.02)), (0.095, 0.095, 0.085), 3, 6, (0.8, 0.8), 0.12, 14)
    S.add('Head', 'Gold', nug); S.add('Head', 'Gold', mirror_x(nug))
    # tanduk kristal: melengkung keluar lalu ke atas-belakang
    hornL = tube([(0.52, 3.40, 0.52), (0.80, 3.54, 0.40), (1.06, 3.80, 0.24), (1.22, 4.12, 0.02)], [0.25, 0.21, 0.13, 0.05], 5, 15, 0.03)
    S.add('Head', 'Crystal', hornL); S.add('Head', 'Crystal', mirror_x(hornL))

    # ── lengan tebal + tangan BESAR bercakar ──
    arm_geo = {}
    for name, s_ in (('ArmL', 1), ('ArmR', -1)):
        upper = tube([(1.28 * s_, 2.38, 0.0), (1.42 * s_, 1.86, 0.04), (1.46 * s_, 1.50, 0.10)], [0.40, 0.36, 0.33], 7, 51 + s_, 0.05, tip=False)
        elbow = blob((1.46 * s_, 1.50, 0.10), (0.38, 0.33, 0.33), 5, 9, (0.8, 0.8), 0.07, 52 + s_)
        fore = tube([(1.46 * s_, 1.50, 0.10), (1.45 * s_, 1.10, 0.26), (1.42 * s_, 0.84, 0.38)], [0.36, 0.36, 0.32], 7, 53 + s_, 0.05, tip=False)
        palm = blob((1.40 * s_, 0.62, 0.44), (0.42, 0.32, 0.30), 5, 9, (0.7, 0.7), 0.06, 54 + s_)
        S.add(name, 'Basalt', upper); S.add(name, 'BasaltDark', elbow); S.add(name, 'Basalt', fore); S.add(name, 'BasaltDark', palm)
        for k, dx in enumerate((-0.21, 0.0, 0.21)):
            fx = (1.40 + dx) * s_
            S.add(name, 'BasaltDark', tube([(fx, 0.50, 0.50), (fx, 0.28, 0.62), (fx, 0.06, 0.68)], [0.13, 0.115, 0.08], 4, 60 + k, 0.0))
        S.add(name, 'BasaltDark', tube([(1.40 * s_ + 0.32 * s_, 0.58, 0.54), (1.40 * s_ + 0.42 * s_, 0.42, 0.68), (1.40 * s_ + 0.45 * s_, 0.28, 0.80)], [0.12, 0.10, 0.07], 4, 70, 0.0))
        arm_geo[name] = upper

    # ── retakan lava (ditempelkan ke permukaan lewat raycast) ──
    def crack(node, surf, plane, path, w=0.05, lift=0.03):
        pts, nrm = project_path(surf, plane, path, 0, lift)
        S.add(node, 'Lava', ribbon(pts, nrm, w))

    # wajah: hanya sedikit, dijauhkan dari mata
    crack('Head', head_surf, 'front', zigzag((0.10, 3.50), -math.pi / 2, 0.26, 4, 0.6, 1), 0.045)
    crack('Head', head_surf, 'front', zigzag((0.66, 3.05), -math.pi / 2 - 0.15, 0.55, 6, 0.6, 2), 0.045)   # pipi sisi mata mati
    crack('Head', head_surf, 'front', zigzag((-0.58, 3.20), -math.pi / 2 + 0.2, 0.30, 4, 0.6, 3), 0.04)
    # celah menyilang mata mati (seperti goresan di maskot)
    crack('Head', head_surf, 'front', [(0.15, 3.10), (0.28, 3.00), (0.40, 2.88), (0.46, 2.82)], 0.035, 0.05)
    # dada: satu urat vertikal bercabang ke bawah (bukan busur)
    crack('Torso', torso_surf, 'front', zigzag((0.04, 2.55), -math.pi / 2, 0.85, 8, 0.55, 4), 0.07)
    crack('Torso', torso_surf, 'front', zigzag((0.0, 2.15), -math.pi / 2 + 0.55, 0.55, 5, 0.6, 5), 0.055)
    crack('Torso', torso_surf, 'front', zigzag((0.0, 1.95), -math.pi / 2 - 0.6, 0.50, 5, 0.6, 6), 0.055)
    crack('Torso', torso_surf, 'front', zigzag((0.70, 2.40), -math.pi / 2 - 0.35, 0.65, 6, 0.7, 7), 0.055)
    crack('Torso', torso_surf, 'front', zigzag((-0.72, 2.34), -math.pi / 2 + 0.30, 0.60, 6, 0.7, 8), 0.055)
    # bahu (dari atas) dan punggung
    crack('Torso', torso_surf, 'top', zigzag((1.10, -0.30), math.pi / 2, 0.60, 6, 0.8, 9), 0.06)
    crack('Torso', torso_surf, 'top', zigzag((-1.10, -0.30), math.pi / 2, 0.60, 6, 0.8, 10), 0.06)
    crack('Torso', torso_surf, 'back', zigzag((0.0, 2.80), -math.pi / 2, 1.0, 9, 0.6, 11), 0.07)
    crack('Torso', torso_surf, 'back', zigzag((0.5, 2.1), -math.pi / 2 - 0.4, 0.5, 5, 0.7, 12), 0.055)
    crack('Torso', torso_surf, 'back', zigzag((-0.55, 2.2), -math.pi / 2 + 0.4, 0.5, 5, 0.7, 13), 0.055)
    for name, s_ in (('ArmL', 1), ('ArmR', -1)):
        crack(name, arm_geo[name], 'front', zigzag((1.42 * s_, 2.10), -math.pi / 2, 0.50, 5, 0.6, 20 + s_), 0.055)

    # skala seragam: ujung tanduk = TARGET_HEIGHT
    top = max(t[:, :, 1].max() for nd in S.nodes.values() for ts in nd['parts'].values() for t in ts)
    scale_scene(S, TARGET_HEIGHT / top)
    return S

# ───────────────────────────── tulis .glb ─────────────────────────────
def flat_normals(tris):
    n = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-12
    return np.repeat(n[:, None, :], 3, axis=1)

def srgb_to_lin(c):
    c = c / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)

def write_glb(S, path):
    names = S.order
    idx = {n: i for i, n in enumerate(names)}
    bin_ = bytearray()
    views, accs, meshes, nodes_json = [], [], [], []

    def add_view(data, target=None):
        while len(bin_) % 4:
            bin_.append(0)
        off = len(bin_)
        bin_.extend(data)
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target:
            v['target'] = target
        views.append(v)
        return len(views) - 1

    tri_total = 0
    for n in names:
        nd = S.nodes[n]
        prims = []
        for mi, m in enumerate(MAT_ORDER):
            if m not in nd['parts']:
                continue
            tris = np.concatenate(nd['parts'][m]) - nd['pivot']  # lokal terhadap pivot node (pose istirahat tanpa rotasi)
            # pivot relatif induk dikoreksi lewat translation node, jadi vertex = dunia - pivot node
            tri_total += len(tris)
            pos = tris.reshape(-1, 3).astype('<f4')
            nor = flat_normals(tris).reshape(-1, 3).astype('<f4')
            pv = add_view(pos.tobytes(), 34962)
            accs.append({'bufferView': pv, 'componentType': 5126, 'count': len(pos), 'type': 'VEC3',
                         'min': pos.min(axis=0).tolist(), 'max': pos.max(axis=0).tolist()})
            pa = len(accs) - 1
            nv = add_view(nor.tobytes(), 34962)
            accs.append({'bufferView': nv, 'componentType': 5126, 'count': len(nor), 'type': 'VEC3'})
            na = len(accs) - 1
            prims.append({'attributes': {'POSITION': pa, 'NORMAL': na}, 'material': mi, 'mode': 4})
        node = {'name': n}
        par = nd['parent']
        node['translation'] = (nd['pivot'] - (S.nodes[par]['pivot'] if par else 0)).round(6).tolist()
        if prims:
            meshes.append({'name': n, 'primitives': prims})
            node['mesh'] = len(meshes) - 1
        nodes_json.append(node)
    for n in names:
        kids = [idx[k] for k in names if S.nodes[k]['parent'] == n]
        if kids:
            nodes_json[idx[n]]['children'] = kids

    materials = []
    for m in MAT_ORDER:
        d = MATS[m]
        lin = srgb_to_lin(np.array(d['color'], float))
        materials.append({'name': m, 'doubleSided': False,
                          'pbrMetallicRoughness': {'baseColorFactor': [*[round(float(x), 5) for x in lin], 1.0],
                                                   'metallicFactor': d['metal'], 'roughnessFactor': d['rough']},
                          'emissiveFactor': list(d['emissive'])})
    while len(bin_) % 4:
        bin_.append(0)
    gj = {
        'asset': {'version': '2.0', 'generator': 'PRIMORDIA tools/make_bruk.py', 'copyright': 'Karya asli PRIMORDIA (CC0)'},
        'scene': 0, 'scenes': [{'name': 'Bruk', 'nodes': [0]}],
        'nodes': nodes_json, 'meshes': meshes, 'materials': materials,
        'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(bin_)}],
    }
    js = json.dumps(gj, separators=(',', ':')).encode()
    while len(js) % 4:
        js += b' '
    glb = (struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bin_)) + struct.pack('<II', len(js), 0x4E4F534A) + js +
           struct.pack('<II', len(bin_), 0x004E4942) + bytes(bin_))
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    open(path, 'wb').write(glb)
    return tri_total, len(glb)

def bounds(S):
    allv = np.concatenate([t.reshape(-1, 3) for n in S.nodes.values() for ts in n['parts'].values() for t in ts])
    return allv.min(axis=0), allv.max(axis=0)

# ───────────────────────────── pratinjau (rasterizer numpy, BUKAN render three.js) ─────────────────────────────
DEFAULT_POSES = {  # cadangan bila poses.json tidak diberikan; nilai sama dengan tabel brukBehavior.ts
    'levels': [
        dict(lean=0.40, glow=0.15, eyeGlow=0.25, eyeOpen=0.35, crackColor=0x2a1410, eyeColor=0x8a5a14, arms=0, headYaw=-0.16, yaw=3.2),
        dict(lean=0.30, glow=0.50, eyeGlow=0.70, eyeOpen=0.60, crackColor=0x7a1c0c, eyeColor=0xc88a22, arms=0, headYaw=-1.1, yaw=1.6),
        dict(lean=0.18, glow=0.95, eyeGlow=1.10, eyeOpen=0.85, crackColor=0xe0601a, eyeColor=0xffb02e, arms=0, headYaw=0.0, yaw=0.9),
        dict(lean=0.10, glow=1.50, eyeGlow=1.60, eyeOpen=1.00, crackColor=0xff8a1f, eyeColor=0xffc24a, arms=0, headYaw=0.0, yaw=0.0),
        dict(lean=0.04, glow=1.90, eyeGlow=1.90, eyeOpen=1.00, crackColor=0xffc04a, eyeColor=0xffd36e, arms=1, headYaw=0.0, yaw=0.0),
    ]
}

def hex_rgb(h):
    return np.array([(h >> 16) & 255, (h >> 8) & 255, h & 255], float) / 255.0

def posed_tris(S, pose):
    """Terapkan pose (lean/headYaw/arms/yaw/eyeOpen) ke segitiga dunia -> daftar (tris, material)."""
    def rx(a): return rot(a, 0, 0)
    def ry(a): return rot(0, a, 0)
    def rz(a): return rot(0, 0, a)
    chain = {}
    def world_transform(name):
        """Kembalikan fungsi titik dunia-istirahat -> dunia-berpose untuk node ini."""
        if name in chain:
            return chain[name]
        nd = S.nodes[name]
        par = nd['parent']
        pf = world_transform(par) if par else (lambda p: p)
        piv = nd['pivot']
        R = np.eye(3)
        sc = np.ones(3)
        if name == 'Torso': R = rx(pose['lean'])
        elif name == 'Head': R = ry(pose['headYaw'])
        elif name == 'ArmL': R = rz(0.4 * pose['arms']) @ rx(-0.9 * pose['arms'])
        elif name == 'ArmR': R = rz(-0.4 * pose['arms']) @ rx(-0.9 * pose['arms'])
        elif name == 'Eye': sc = np.array([1.0, max(pose['eyeOpen'], 0.05), 1.0])
        elif name == 'Bruk': R = ry(pose['yaw'])
        def f(p, R=R, piv=piv, sc=sc, pf=pf):
            q = (p - piv) * sc
            return pf(q @ R.T + piv)
        chain[name] = f
        return f
    out = []
    for n in S.order:
        f = world_transform(n)
        for m, ts in S.nodes[n]['parts'].items():
            for t in ts:
                out.append((f(t.reshape(-1, 3)).reshape(-1, 3, 3), m))
    return out

def render(S, pose, view, W=420, H=560, ss=2):
    if view != 'ingame':
        pose = dict(pose, yaw=0.0, headYaw=0.0)  # sheet inspeksi: badan & kepala lurus ke kamera
    from PIL import Image
    from scipy.ndimage import gaussian_filter
    Wr, Hr = W * ss, H * ss
    items = posed_tris(S, pose)
    yaw_cam = {'front': 0.0, 'side': math.pi / 2, 'back': math.pi, 'quarter': 0.62, 'ingame': 0.0}[view]
    dist, fov = 9.5, 36.0
    cam_target = np.array([0, 1.75, 0.0])
    cp = cam_target + np.array([math.sin(yaw_cam) * dist, 0.9, math.cos(yaw_cam) * dist])
    fwd = (cam_target - cp); fwd /= np.linalg.norm(fwd)
    right = np.cross(fwd, [0, 1, 0]); right /= np.linalg.norm(right)
    up = np.cross(right, fwd)
    f = 1.0 / math.tan(math.radians(fov) / 2)
    key = np.array([-0.45, 0.75, 0.55]); key /= np.linalg.norm(key)
    fill = np.array([0.6, 0.2, 0.4]); fill /= np.linalg.norm(fill)
    zbuf = np.full((Hr, Wr), 1e9)
    col = np.zeros((Hr, Wr, 3))
    emi = np.zeros((Hr, Wr, 3))
    # latar gradasi gelap (seperti maskot)
    yy = np.linspace(0, 1, Hr)[:, None]
    bg = np.array([0.012, 0.016, 0.02])[None, None, :] * (1.0 - 0.4 * yy[..., None]) + 0.002
    col[:] = bg
    for tris, m in items:
        d = MATS[m]
        base = srgb_to_lin(np.array(d['color'], float))
        for t in tris:
            n = np.cross(t[1] - t[0], t[2] - t[0]); ln = np.linalg.norm(n)
            if ln < 1e-12: continue
            n /= ln
            cen = t.mean(axis=0)
            if np.dot(n, cp - cen) <= 0:  # buang sisi belakang seperti three (FrontSide)
                continue
            rel = t - cp
            xc, yc, zc = rel @ right, rel @ up, rel @ fwd
            if (zc <= 0.1).any(): continue
            sx = (xc * f / zc) / (Wr / Hr) * (Hr / 2) + Wr / 2
            sy = Hr / 2 - (yc * f / zc) * (Hr / 2)
            minx, maxx = int(max(0, math.floor(sx.min()))), int(min(Wr - 1, math.ceil(sx.max())))
            miny, maxy = int(max(0, math.floor(sy.min()))), int(min(Hr - 1, math.ceil(sy.max())))
            if minx > maxx or miny > maxy: continue
            gx, gy = np.meshgrid(np.arange(minx, maxx + 1) + 0.5, np.arange(miny, maxy + 1) + 0.5)
            d0 = (sx[1] - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (sy[1] - sy[0])
            if abs(d0) < 1e-9: continue
            w1 = ((gx - sx[0]) * (sy[2] - sy[0]) - (sx[2] - sx[0]) * (gy - sy[0])) / d0
            w2 = ((sx[1] - sx[0]) * (gy - sy[0]) - (gx - sx[0]) * (sy[1] - sy[0])) / d0
            w0 = 1 - w1 - w2
            inside = (w0 >= 0) & (w1 >= 0) & (w2 >= 0)
            if not inside.any(): continue
            depth = w0 * zc[0] + w1 * zc[1] + w2 * zc[2]
            sub = zbuf[miny:maxy + 1, minx:maxx + 1]
            upd = inside & (depth < sub - 1e-4)
            if not upd.any(): continue
            sub[upd] = depth[upd]
            # shading
            lam = max(np.dot(n, key), 0) * 1.05 + max(np.dot(n, fill), 0) * 0.28 + 0.16 + max(n[1], 0) * 0.08
            rimv = max(0.0, 1 - np.dot(n, -fwd)) ** 2 * 0.22
            em = np.zeros(3)
            if m == 'Lava':
                em = hex_rgb(pose['crackColor']) ** 2.2 * pose['glow']
            elif m == 'Eye':
                em = hex_rgb(pose['eyeColor']) ** 2.2 * pose['eyeGlow']
            elif m == 'Crystal':
                em = np.array(d['emissive']) * 0.8
            c = base * lam + rimv * np.array([0.10, 0.14, 0.18]) + em * 0.7
            region = col[miny:maxy + 1, minx:maxx + 1]
            region[upd] = c
            if em.any():
                emi[miny:maxy + 1, minx:maxx + 1][upd] = em
    # cahaya dari emissive (bloom sederhana) — hanya aproksimasi
    glow = gaussian_filter(emi, sigma=(9 * ss / 2, 9 * ss / 2, 0)) * 0.9 + gaussian_filter(emi, sigma=(3 * ss, 3 * ss, 0)) * 0.5
    img = col + glow
    img = np.clip(img / (1 + img * 0.35), 0, 1) ** (1 / 2.2)   # tone-map lembut + gamma
    im = Image.fromarray((img * 255).astype('uint8')).resize((W, H), Image.LANCZOS)
    return im

def preview(S, outdir, poses):
    from PIL import Image, ImageDraw
    os.makedirs(outdir, exist_ok=True)
    levels = poses['levels']
    for view in ('front', 'quarter', 'back', 'side', 'ingame'):
        ims = [render(S, p, view) for p in levels]
        W, H = ims[0].size
        sheet = Image.new('RGB', (W * len(ims), H + 24), (8, 10, 12))
        dr = ImageDraw.Draw(sheet)
        for i, im in enumerate(ims):
            sheet.paste(im, (i * W, 24))
            dr.text((i * W + 8, 6), f'tingkat {i}  ({view})', fill=(220, 200, 160))
        sheet.save(os.path.join(outdir, f'bruk_{view}.png'))
    # skala vs manusia 1,8 m (siluet) + lima tingkat dalam satu baris kecil dari jauh
    print('pratinjau ditulis ke', outdir)

if __name__ == '__main__':
    S = build()
    tris, size = write_glb(S, OUT)
    lo, hi = bounds(S)
    print(f'segitiga: {tris} (maks {MAX_TRIS})  ukuran: {size / 1024:.1f} KB (maks {MAX_BYTES // 1024} KB)')
    print('batas  min', lo.round(2), ' max', hi.round(2), f' tinggi {hi[1] - lo[1]:.2f} m, lebar {hi[0] - lo[0]:.2f} m, kedalaman {hi[2] - lo[2]:.2f} m')
    assert tris <= MAX_TRIS, 'melebihi anggaran segitiga'
    assert size <= MAX_BYTES, 'melebihi anggaran ukuran'
    if '--preview' in sys.argv:
        poses = DEFAULT_POSES
        if '--poses' in sys.argv:
            poses = json.load(open(sys.argv[sys.argv.index('--poses') + 1]))
        preview(S, sys.argv[sys.argv.index('--preview') + 1], poses)
