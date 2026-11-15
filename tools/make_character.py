#!/usr/bin/env python3
"""
Pembuat karakter manusia PRIMORDIA (Adam & Hawa) — tanpa Blender, tanpa internet.

Menghasilkan .glb berangka (19 sendi, penamaan gaya Mixamo) + 10 klip animasi prosedural
(idle, walk, run, jump, fall, swim, mine, craft, hurt, death). Karya asli PRIMORDIA: bebas dipakai.
Material: Skin / Hair / Cloth / Eyes (tanpa tekstur → ringan, mudah di-tint per AvatarConfig).

Pakai:  python3 tools/make_character.py            # tulis public/play/models/primordia_{adam,hawa}.glb
        python3 tools/make_character.py --preview /tmp/prev   # + gambar pratinjau PNG (butuh numpy+matplotlib)
Arah hadap +Z, kiri karakter = +X, kaki di y=0, Y atas.
"""
import json, math, os, struct, sys
import numpy as np

SEG = 10  # sisi tabung
OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'play', 'models')

# ── Rangka ────────────────────────────────────────────────────────────────
# nama: (induk, posisi dunia rest). Kiri = +X.
def skeleton(build):
    f = build['scale']
    sh = build['shoulder']
    hp = build['hip']
    P = {
        'mixamorigHips': (None, (0, 0.98, 0)),
        'mixamorigSpine': ('mixamorigHips', (0, 1.08, 0)),
        'mixamorigSpine2': ('mixamorigSpine', (0, 1.28, 0)),
        'mixamorigNeck': ('mixamorigSpine2', (0, 1.50, 0)),
        'mixamorigHead': ('mixamorigNeck', (0, 1.58, 0)),
    }
    for side, s in (('Left', 1), ('Right', -1)):
        P[f'mixamorig{side}Shoulder'] = ('mixamorigSpine2', (0.05 * s, 1.45, 0))
        P[f'mixamorig{side}Arm'] = (f'mixamorig{side}Shoulder', (sh * s, 1.45, 0))
        P[f'mixamorig{side}ForeArm'] = (f'mixamorig{side}Arm', (sh * s, 1.17, 0))
        P[f'mixamorig{side}Hand'] = (f'mixamorig{side}ForeArm', (sh * s, 0.90, 0))
        P[f'mixamorig{side}UpLeg'] = ('mixamorigHips', (hp * s, 0.95, 0))
        P[f'mixamorig{side}Leg'] = (f'mixamorig{side}UpLeg', (hp * s, 0.52, 0))
        P[f'mixamorig{side}Foot'] = (f'mixamorig{side}Leg', (hp * s, 0.09, 0))
    # skala tinggi (kaki tetap di y=0)
    for k, (par, pos) in list(P.items()):
        P[k] = (par, (pos[0] * f, pos[1] * f, pos[2] * f))
    return P

# ── Geometri ──────────────────────────────────────────────────────────────
class Part:
    """Kumpulan verteks berbobot kulit untuk satu material."""
    def __init__(self, material):
        self.material = material
        self.pos, self.joints, self.weights, self.tris = [], [], [], []

    def add_vertex(self, p, jw):
        jw = sorted(jw, key=lambda x: -x[1])[:2]
        tot = sum(w for _, w in jw) or 1.0
        jw = [(j, w / tot) for j, w in jw]
        while len(jw) < 2:
            jw.append((jw[0][0], 0.0))
        self.pos.append(p)
        self.joints.append((jw[0][0], jw[1][0], 0, 0))
        self.weights.append((jw[0][1], jw[1][1], 0.0, 0.0))
        return len(self.pos) - 1

def smooth(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)

def loft(part, rings, joint_index, axis='y', seg=SEG, caps=True, center_hint=None):
    """rings: list of (cx, cy, cz, ra, rb, weights[(jointname, w)]).
    axis 'y': cincin horizontal (ra=x, rb=z). axis 'z': cincin di bidang XY (ra=x, rb=y)."""
    base = len(part.pos)
    n = len(rings)
    for (cx, cy, cz, ra, rb, jw) in rings:
        jwi = [(joint_index[j], w) for j, w in jw]
        for k in range(seg):
            a = 2 * math.pi * k / seg
            if axis == 'y':
                p = (cx + ra * math.cos(a), cy, cz + rb * math.sin(a))
            else:
                p = (cx + ra * math.cos(a), cy + rb * math.sin(a), cz)
            part.add_vertex(p, jwi)
    centers = [np.array(r[:3]) for r in rings]
    tris, outs = [], []
    for i in range(n - 1):
        for k in range(seg):
            a, b = base + i * seg + k, base + i * seg + (k + 1) % seg
            c, d = base + (i + 1) * seg + k, base + (i + 1) * seg + (k + 1) % seg
            mid = (centers[i] + centers[i + 1]) / 2
            tris += [(a, b, c), (b, d, c)]
            outs += [mid, mid]
    if caps:
        for end in (0, n - 1):
            cx, cy, cz, ra, rb, jw = rings[end]
            ci = part.add_vertex((cx, cy, cz), [(joint_index[j], w) for j, w in jw])
            nb = centers[1] if end == 0 else centers[n - 2]
            for k in range(seg):
                a, b = base + end * seg + k, base + end * seg + (k + 1) % seg
                tris.append((ci, a, b))
                outs.append(nb)  # arah keluar = menjauhi cincin tetangga
    orient(part, tris, outs, mode='ring')
    return tris

def ellipsoid(part, center, radii, jw, joint_index, lat=(0.0, 1.0), nlat=6, nlon=10):
    """Elipsoid (lat 0..1 = kutub atas..bawah)."""
    base = len(part.pos)
    jwi = [(joint_index[j], w) for j, w in jw]
    rows = []
    for i in range(nlat + 1):
        v = lat[0] + (lat[1] - lat[0]) * i / nlat
        th = math.pi * v
        ring = []
        for k in range(nlon):
            ph = 2 * math.pi * k / nlon
            p = (center[0] + radii[0] * math.sin(th) * math.cos(ph),
                 center[1] + radii[1] * math.cos(th),
                 center[2] + radii[2] * math.sin(th) * math.sin(ph))
            ring.append(part.add_vertex(p, jwi))
        rows.append(ring)
    tris = []
    for i in range(nlat):
        for k in range(nlon):
            a, b = rows[i][k], rows[i][(k + 1) % nlon]
            c, d = rows[i + 1][k], rows[i + 1][(k + 1) % nlon]
            tris += [(a, b, c), (b, d, c)]
    orient(part, tris, [np.array(center)] * len(tris), mode='ring')
    return tris

def orient(part, tris, refs, mode='ring'):
    """Balik tiap segitiga yang normalnya menghadap ke dalam. refs[i] = titik acuan di dalam bentuk
    (pusat cincin / pusat elipsoid); untuk tutup tabung, refs = cincin tetangga (keluar = menjauhinya)."""
    P = np.array(part.pos)
    out = []
    for (a, b, c), ref in zip(tris, refs):
        n = np.cross(P[b] - P[a], P[c] - P[a])
        mid = (P[a] + P[b] + P[c]) / 3
        out.append((a, c, b) if np.dot(n, mid - ref) < 0 else (a, b, c))
    tris[:] = out
    part.tris.extend(out)

# bobot torso menurut tinggi
def torso_weights(y, s):
    pts = [(0.98 * s, 'mixamorigHips'), (1.08 * s, 'mixamorigSpine'), (1.28 * s, 'mixamorigSpine2'), (1.50 * s, 'mixamorigNeck')]
    if y <= pts[0][0]:
        return [(pts[0][1], 1.0)]
    for (y0, j0), (y1, j1) in zip(pts, pts[1:]):
        if y <= y1:
            t = smooth((y - y0) / (y1 - y0))
            return [(j0, 1 - t), (j1, t)]
    return [(pts[-1][1], 1.0)]

def build_parts(build, joint_index):
    s, sh, hp = build['scale'], build['shoulder'], build['hip']
    skin, hair, cloth, eyes = Part('Skin'), Part('Hair'), Part('Cloth'), Part('Eyes')
    W = lambda *a: list(a)

    # Torso: (y, rx, rz)
    prof = build['torso']
    rings = [(0, y * s, 0, rx, rz, torso_weights(y * s, s)) for (y, rx, rz) in prof]
    loft(skin, rings, joint_index)

    # Leher
    neck = [(0, 1.47 * s, 0, 0.058, 0.058, W(('mixamorigNeck', 1.0))),
            (0, 1.56 * s, 0.005, 0.05, 0.052, W(('mixamorigNeck', 0.5), ('mixamorigHead', 0.5))),
            (0, 1.62 * s, 0.01, 0.048, 0.05, W(('mixamorigHead', 1.0)))]
    loft(skin, neck, joint_index)

    # Kepala + mata + hidung
    hc = (0, 1.70 * s, 0.01)
    ellipsoid(skin, hc, (0.086 * build['head'], 0.108 * build['head'], 0.098 * build['head']), W(('mixamorigHead', 1.0)), joint_index, nlat=8, nlon=12)
    ellipsoid(skin, (0, 1.68 * s, 0.108 * build['head']), (0.016, 0.02, 0.022), W(('mixamorigHead', 1.0)), joint_index, nlat=3, nlon=6)
    for sx in (-1, 1):
        ellipsoid(eyes, (0.032 * sx, 1.715 * s, 0.092 * build['head']), (0.011, 0.011, 0.008), W(('mixamorigHead', 1.0)), joint_index, nlat=3, nlon=6)

    # Rambut: tudung kepala + (opsional) rambut panjang di belakang
    ellipsoid(hair, (0, 1.715 * s, 0.0), (0.094 * build['head'], 0.108 * build['head'], 0.104 * build['head']),
              W(('mixamorigHead', 1.0)), joint_index, lat=(0.0, 0.62), nlat=5, nlon=12)
    if build['hair_len'] > 0:
        L = build['hair_len']
        rr = [(0, 1.66 * s, -0.082, 0.085, 0.032, W(('mixamorigHead', 1.0))),
              (0, (1.56 - 0.12 * L) * s, -0.085, 0.07, 0.03, W(('mixamorigHead', 0.6), ('mixamorigNeck', 0.4))),
              (0, (1.50 - 0.2 * L) * s, -0.075, 0.05, 0.026, W(('mixamorigNeck', 0.5), ('mixamorigSpine2', 0.5)))]
        loft(hair, rr, joint_index)

    # Lengan & kaki per sisi
    for side, sg in (('Left', 1), ('Right', -1)):
        A, F, H = f'mixamorig{side}Arm', f'mixamorig{side}ForeArm', f'mixamorig{side}Hand'
        UL, LL, FT = f'mixamorig{side}UpLeg', f'mixamorig{side}Leg', f'mixamorig{side}Foot'
        ar = build['arm_r']
        x = sh * sg * s
        arm = [(x, 1.47 * s, 0, ar * 1.15, ar * 1.15, W(('mixamorigSpine2', 0.3), (A, 0.7))),
               (x, 1.40 * s, 0, ar * 1.1, ar * 1.1, W((A, 1.0))),
               (x, 1.22 * s, 0, ar * 0.9, ar * 0.9, W((A, 1.0))),
               (x, 1.14 * s, 0, ar * 0.86, ar * 0.86, W((A, 0.5), (F, 0.5))),
               (x, 1.04 * s, 0, ar * 0.8, ar * 0.8, W((F, 1.0))),
               (x, 0.93 * s, 0, ar * 0.66, ar * 0.66, W((F, 0.6), (H, 0.4)))]
        loft(skin, arm, joint_index, seg=8)
        hand = [(x, 0.92 * s, 0, ar * 0.7, ar * 0.7, W((H, 1.0))),
                (x, 0.84 * s, 0.005, ar * 0.62, ar * 1.0, W((H, 1.0))),
                (x, 0.79 * s, 0.01, ar * 0.4, ar * 0.7, W((H, 1.0)))]
        loft(skin, hand, joint_index, seg=8)

        lx = hp * sg * s
        lr = build['leg_r']
        leg = [(lx, 1.00 * s, 0, lr * 1.12, lr * 1.12, W(('mixamorigHips', 0.5), (UL, 0.5))),
               (lx, 0.90 * s, 0, lr * 1.1, lr * 1.1, W((UL, 1.0))),
               (lx, 0.70 * s, 0, lr * 0.88, lr * 0.88, W((UL, 1.0))),
               (lx, 0.57 * s, 0, lr * 0.72, lr * 0.72, W((UL, 0.6), (LL, 0.4))),
               (lx, 0.50 * s, 0, lr * 0.68, lr * 0.68, W((LL, 1.0))),
               (lx, 0.30 * s, 0, lr * 0.6, lr * 0.6, W((LL, 1.0))),
               (lx, 0.14 * s, 0, lr * 0.46, lr * 0.46, W((LL, 0.7), (FT, 0.3))),
               (lx, 0.09 * s, 0, lr * 0.44, lr * 0.44, W((LL, 0.3), (FT, 0.7)))]
        loft(skin, leg, joint_index, seg=8)
        foot = [(lx, 0.07 * s, -0.06, lr * 0.5, 0.045, W((FT, 1.0))),
                (lx, 0.055 * s, 0.05, lr * 0.55, 0.04, W((FT, 1.0))),
                (lx, 0.03 * s, 0.17, lr * 0.42, 0.025, W((FT, 1.0)))]
        loft(skin, foot, joint_index, axis='z', seg=8)

    # Kain: cawat/celana pendek (+ atasan bila ada)
    ck = build['cloth']
    cl = [(0, 0.80 * s, 0, ck[0], ck[1], W(('mixamorigHips', 1.0))),
          (0, 0.92 * s, 0, ck[0] * 1.02, ck[1] * 1.02, W(('mixamorigHips', 1.0))),
          (0, 1.04 * s, 0, ck[2], ck[3], W(('mixamorigHips', 0.6), ('mixamorigSpine', 0.4)))]
    loft(cloth, cl, joint_index, caps=False)
    if build['top']:
        tp = [(0, 1.22 * s, 0, build['top'][0], build['top'][1], W(('mixamorigSpine2', 1.0))),
              (0, 1.34 * s, 0, build['top'][2], build['top'][3], W(('mixamorigSpine2', 1.0))),
              (0, 1.42 * s, 0, build['top'][4], build['top'][5], W(('mixamorigSpine2', 1.0)))]
        loft(cloth, tp, joint_index, caps=False)
    return [skin, hair, cloth, eyes]

# ── Animasi ───────────────────────────────────────────────────────────────
def qx(a): return (math.sin(a / 2), 0, 0, math.cos(a / 2))
def qy(a): return (0, math.sin(a / 2), 0, math.cos(a / 2))
def qz(a): return (0, 0, math.sin(a / 2), math.cos(a / 2))
def qmul(a, b):
    ax, ay, az, aw = a; bx, by, bz, bw = b
    return (aw * bx + ax * bw + ay * bz - az * by, aw * by - ax * bz + ay * bw + az * bx,
            aw * bz + ax * by - ay * bx + az * bw, aw * bw - ax * bx - ay * by - az * bz)
def rot(x=0.0, y=0.0, z=0.0): return qmul(qmul(qy(y), qx(x)), qz(z))

J = lambda n: 'mixamorig' + n
FPS = 30

def pose(name, t, dur, build):
    """Kembalikan ({tulang: quat}, offset_hips_xyz) pada waktu t. Konvensi: ayun ke depan = rotasi X NEGATIF pada paha/lengan,
    tekuk lutut = X positif, tekuk siku = X negatif, condong ke depan (tulang punggung/pinggul) = X positif,
    lengan terbuka ke samping = Z positif di kiri (+X), negatif di kanan."""
    ph = 2 * math.pi * t / dur
    R = {}; off = [0.0, 0.0, 0.0]
    def limb(side, thigh_fwd, knee, arm_fwd, elbow, abduct=0.0):
        sg = 1 if side == 'Left' else -1
        R[J(side + 'UpLeg')] = rot(x=-thigh_fwd)
        R[J(side + 'Leg')] = rot(x=knee)
        R[J(side + 'Arm')] = rot(x=-arm_fwd, z=abduct * sg)
        R[J(side + 'ForeArm')] = rot(x=-elbow)
    if name == 'idle':
        b = math.sin(ph)
        R[J('Spine2')] = rot(x=0.02 * b); R[J('Head')] = rot(x=-0.01 * b, y=0.04 * math.sin(ph * 0.5))
        for side, sg in (('Left', 1), ('Right', -1)):
            R[J(side + 'Arm')] = rot(x=0.03 * b * sg, z=0.06 * sg); R[J(side + 'ForeArm')] = rot(x=-0.08)
        off[1] = 0.004 * math.sin(ph)
    elif name in ('walk', 'run'):
        run = name == 'run'
        A = 0.95 if run else 0.5
        K = 1.3 if run else 0.8
        AA = 0.85 if run else 0.45
        E = 1.35 if run else 0.3
        sL, cL = math.sin(ph), math.cos(ph)
        limb('Left', A * sL, K * max(0, cL) + (0.15 if run else 0), -AA * sL, E + (0.2 * sL if not run else 0.1 * sL))
        limb('Right', -A * sL, K * max(0, -cL) + (0.15 if run else 0), AA * sL, E - (0.2 * sL if not run else 0.1 * sL))
        R[J('Hips')] = rot(x=0.1 if run else 0.02, y=(0.14 if run else 0.08) * sL)
        R[J('Spine2')] = rot(x=0.12 if run else 0.04, y=-(0.16 if run else 0.1) * sL)
        R[J('Head')] = rot(x=-(0.1 if run else 0.02))
        off[1] = (0.05 if run else 0.018) * math.cos(2 * ph) * (1 if not run else 1) - (0.0)
        R[J('Left' + 'Foot')] = rot(x=-0.1 * sL); R[J('Right' + 'Foot')] = rot(x=0.1 * sL)
    elif name == 'jump':
        u = math.sin(math.pi * t / dur)
        limb('Left', 0.9 * u, 1.3 * u, 1.2 * u, 0.5, 0.3)
        limb('Right', 0.5 * u, 1.0 * u, 1.2 * u, 0.5, 0.3)
        R[J('Spine2')] = rot(x=-0.05 * u)
        off[1] = 0.08 * u
    elif name == 'fall':
        fl = math.sin(ph * 2)
        limb('Left', 0.3 + 0.1 * fl, 0.5, 0.2, 0.3, 1.1 + 0.1 * fl)
        limb('Right', 0.1 - 0.1 * fl, 0.6, 0.2, 0.3, 1.1 - 0.1 * fl)
        R[J('Spine2')] = rot(x=-0.08)
    elif name == 'swim':
        R[J('Hips')] = rot(x=1.15)
        sL = math.sin(ph)
        limb('Left', 0.25 * math.sin(ph * 3), 0.25, 2.2 * math.sin(ph) + 1.0, 0.4)
        limb('Right', -0.25 * math.sin(ph * 3), 0.25, 2.2 * math.sin(ph + math.pi) + 1.0, 0.4)
        R[J('Head')] = rot(x=-0.9)
        off[1] = -0.1
    elif name == 'mine':
        c = math.cos(ph)
        for side in ('Left', 'Right'):
            sg = 1 if side == 'Left' else -1
            R[J(side + 'Arm')] = rot(x=-(1.45 + 1.15 * c), z=0.1 * sg)
            R[J(side + 'ForeArm')] = rot(x=-(0.9 - 0.6 * c))
        R[J('Spine')] = rot(x=0.12 - 0.16 * c); R[J('Spine2')] = rot(x=0.06 - 0.12 * c)
        limb_l = rot(x=-0.25); limb_r = rot(x=0.25)
        R[J('LeftUpLeg')] = limb_l; R[J('RightUpLeg')] = limb_r
        R[J('LeftLeg')] = rot(x=0.35); R[J('RightLeg')] = rot(x=0.2)
        off[1] = -0.03
    elif name == 'craft':
        o = math.sin(ph * 2)
        for side in ('Left', 'Right'):
            R[J(side + 'Arm')] = rot(x=-0.7)
            R[J(side + 'ForeArm')] = rot(x=-(0.9 + 0.15 * (o if side == 'Left' else -o)))
        R[J('Spine')] = rot(x=0.12); R[J('Head')] = rot(x=0.2)
    elif name == 'hurt':
        u = math.sin(math.pi * min(1.0, t / dur))
        R[J('Spine')] = rot(x=-0.3 * u); R[J('Spine2')] = rot(x=-0.15 * u); R[J('Head')] = rot(x=-0.25 * u)
        for side, sg in (('Left', 1), ('Right', -1)):
            R[J(side + 'Arm')] = rot(x=0.2 * u, z=0.5 * u * sg); R[J(side + 'ForeArm')] = rot(x=-0.4 * u)
        off[2] = -0.05 * u
    elif name == 'death':
        u = smooth(t / dur)
        R[J('Hips')] = rot(x=-1.45 * u)
        limb('Left', -0.2 * u, 0.4 * u, -0.3 * u, 0.2, 0.9 * u)
        limb('Right', 0.1 * u, 0.3 * u, 0.1 * u, 0.2, 0.7 * u)
        R[J('Head')] = rot(x=0.2 * u)
        off[1] = -0.78 * u * build['scale']; off[2] = -0.15 * u
    return R, off

CLIPS = [('Idle', 'idle', 3.0, True), ('Walk', 'walk', 1.0, True), ('Run', 'run', 0.62, True), ('Jump', 'jump', 0.8, False),
         ('Fall', 'fall', 1.0, True), ('Swim', 'swim', 1.2, True), ('Mine', 'mine', 0.9, True), ('Craft', 'craft', 1.6, True),
         ('Hurt', 'hurt', 0.5, False), ('Death', 'death', 1.5, False)]

# ── Penulis glTF ──────────────────────────────────────────────────────────
class Buf:
    def __init__(self): self.data = bytearray(); self.views = []; self.acc = []
    def view(self, raw, target=None):
        while len(self.data) % 4: self.data.append(0)
        off = len(self.data); self.data += raw
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(raw)}
        if target: v['target'] = target
        self.views.append(v); return len(self.views) - 1
    def accessor(self, raw, ctype, count, atype, target=None, minmax=None, norm=False):
        a = {'bufferView': self.view(raw, target), 'componentType': ctype, 'count': count, 'type': atype}
        if minmax: a['min'], a['max'] = minmax
        if norm: a['normalized'] = True
        self.acc.append(a); return len(self.acc) - 1

def write_glb(name, build):
    P = skeleton(build)
    names = list(P.keys())
    jidx = {n: i for i, n in enumerate(names)}
    parts = [p for p in build_parts(build, jidx) if p.tris]

    nodes = []
    for n in names:
        par, pos = P[n]
        lp = pos if par is None else tuple(pos[i] - P[par][1][i] for i in range(3))
        nodes.append({'name': n, 'translation': [round(v, 6) for v in lp]})
    for i, n in enumerate(names):
        par = P[n][0]
        if par is not None:
            nodes[jidx[par]].setdefault('children', []).append(i)
    mesh_node = len(nodes)
    nodes.append({'name': 'Body', 'mesh': 0, 'skin': 0})

    b = Buf()
    # inverse bind matrices (kolom-mayor)
    ibm = bytearray()
    for n in names:
        x, y, z = P[n][1]
        ibm += struct.pack('<16f', 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1)
    ibm_acc = b.accessor(bytes(ibm), 5126, len(names), 'MAT4')

    materials = {'Skin': build['skin'], 'Hair': build['hair'], 'Cloth': build['cloth_col'], 'Eyes': [0.05, 0.05, 0.06, 1.0]}
    mat_list = []; mat_idx = {}
    for p in parts:
        if p.material not in mat_idx:
            mat_idx[p.material] = len(mat_list)
            mat_list.append({'name': p.material, 'pbrMetallicRoughness': {'baseColorFactor': materials[p.material], 'metallicFactor': 0.0, 'roughnessFactor': 0.85}})

    prims = []; tri_total = 0
    for p in parts:
        pos = np.array(p.pos, dtype=np.float32)
        idx = np.array(p.tris, dtype=np.uint32)
        nrm = np.zeros_like(pos)
        for a, bb, c in idx:
            fn = np.cross(pos[bb] - pos[a], pos[c] - pos[a])
            nrm[a] += fn; nrm[bb] += fn; nrm[c] += fn
        ln = np.linalg.norm(nrm, axis=1, keepdims=True); ln[ln == 0] = 1
        nrm = (nrm / ln).astype(np.float32)
        jt = np.array(p.joints, dtype=np.uint8); wt = np.array(p.weights, dtype=np.float32)
        tri_total += len(idx)
        prims.append({
            'attributes': {
                'POSITION': b.accessor(pos.tobytes(), 5126, len(pos), 'VEC3', 34962, ([float(v) for v in pos.min(0)], [float(v) for v in pos.max(0)])),
                'NORMAL': b.accessor(nrm.tobytes(), 5126, len(nrm), 'VEC3', 34962),
                'JOINTS_0': b.accessor(jt.tobytes(), 5121, len(jt), 'VEC4', 34962),
                'WEIGHTS_0': b.accessor(wt.tobytes(), 5126, len(wt), 'VEC4', 34962)},
            'indices': b.accessor(idx.astype(np.uint16).tobytes(), 5123, idx.size, 'SCALAR', 34963),
            'material': mat_idx[p.material]})

    # animasi
    samplers, channels, anims = [], [], []
    for cname, key, dur, loop in CLIPS:
        n = max(2, int(round(dur * FPS)) + (1 if loop else 0))
        times = [i / FPS for i in range(n)] if not loop else [i * dur / (n - 1) for i in range(n)]
        if not loop: times[-1] = dur
        tarr = np.array(times, dtype=np.float32)
        t_acc = b.accessor(tarr.tobytes(), 5126, n, 'SCALAR', None, ([float(tarr.min())], [float(tarr.max())]))
        per = {nm: [] for nm in names}
        hips_t = []
        for tt in times:
            R, off = pose(key, tt, dur, build)
            for nm in names:
                per[nm].append(R.get(nm, (0, 0, 0, 1)))
            hp = P['mixamorigHips'][1]
            hips_t.append((hp[0] + off[0], hp[1] + off[1], hp[2] + off[2]))
        sm, ch = [], []
        for nm in names:
            q = np.array(per[nm], dtype=np.float32)
            if np.allclose(q, [0, 0, 0, 1], atol=1e-6): continue
            q /= np.linalg.norm(q, axis=1, keepdims=True)
            o_acc = b.accessor(q.tobytes(), 5126, n, 'VEC4')
            sm.append({'input': t_acc, 'output': o_acc, 'interpolation': 'LINEAR'})
            ch.append({'sampler': len(sm) - 1, 'target': {'node': jidx[nm], 'path': 'rotation'}})
        tr = np.array(hips_t, dtype=np.float32)
        o_acc = b.accessor(tr.tobytes(), 5126, n, 'VEC3')
        sm.append({'input': t_acc, 'output': o_acc, 'interpolation': 'LINEAR'})
        ch.append({'sampler': len(sm) - 1, 'target': {'node': jidx['mixamorigHips'], 'path': 'translation'}})
        anims.append({'name': cname, 'samplers': sm, 'channels': ch})

    gltf = {
        'asset': {'version': '2.0', 'generator': 'PRIMORDIA tools/make_character.py', 'copyright': 'Karya asli PRIMORDIA (CC0)'},
        'scene': 0, 'scenes': [{'nodes': [jidx['mixamorigHips'], mesh_node]}],
        'nodes': nodes, 'skins': [{'joints': list(range(len(names))), 'skeleton': jidx['mixamorigHips'], 'inverseBindMatrices': ibm_acc}],
        'meshes': [{'name': 'Body', 'primitives': prims}], 'materials': mat_list,
        'animations': anims, 'accessors': b.acc, 'bufferViews': b.views, 'buffers': [{'byteLength': len(b.data)}]}
    js = json.dumps(gltf, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    bd = bytes(b.data) + b'\0' * ((4 - len(b.data) % 4) % 4)
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bd)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(bd), 0x004E4942) + bd
    path = os.path.join(OUT_DIR, name)
    os.makedirs(OUT_DIR, exist_ok=True)
    open(path, 'wb').write(glb)
    print(f'{name}: {len(glb)/1024:.1f} KB, {tri_total} segitiga, {len(names)} sendi, {len(anims)} klip')
    return dict(P=P, names=names, parts=parts, tri=tri_total, build=build)

# ── Varian tubuh ──────────────────────────────────────────────────────────
ADAM = dict(scale=1.0, shoulder=0.20, hip=0.095, head=1.0, arm_r=0.046, leg_r=0.085, hair_len=0.0,
            skin=[0.78, 0.55, 0.40, 1.0], hair=[0.12, 0.08, 0.05, 1.0], cloth_col=[0.42, 0.34, 0.22, 1.0],
            torso=[(0.93, 0.15, 0.10), (1.00, 0.17, 0.105), (1.10, 0.15, 0.095), (1.20, 0.17, 0.105), (1.32, 0.205, 0.115), (1.42, 0.2, 0.105), (1.48, 0.085, 0.07)],
            cloth=(0.19, 0.125, 0.175, 0.115), top=None)
HAWA = dict(scale=0.94, shoulder=0.175, hip=0.095, head=0.98, arm_r=0.038, leg_r=0.08, hair_len=1.0,
            skin=[0.82, 0.60, 0.45, 1.0], hair=[0.10, 0.06, 0.04, 1.0], cloth_col=[0.55, 0.38, 0.25, 1.0],
            torso=[(0.93, 0.165, 0.105), (1.00, 0.18, 0.11), (1.10, 0.135, 0.09), (1.20, 0.15, 0.10), (1.32, 0.18, 0.115), (1.42, 0.17, 0.10), (1.48, 0.08, 0.065)],
            cloth=(0.2, 0.13, 0.17, 0.115), top=(0.155, 0.105, 0.17, 0.12, 0.16, 0.11))

# ── Pratinjau (verifikasi visual tanpa three.js) ──────────────────────────
def skin_pose(info, clip_key, t, dur):
    P, names, build = info['P'], info['names'], info['build']
    R, off = pose(clip_key, t, dur, build)
    world = {}
    def mat_of(q):
        x, y, z, w = q
        return np.array([[1-2*(y*y+z*z), 2*(x*y-z*w), 2*(x*z+y*w)], [2*(x*y+z*w), 1-2*(x*x+z*z), 2*(y*z-x*w)], [2*(x*z-y*w), 2*(y*z+x*w), 1-2*(x*x+y*y)]])
    for n in names:
        par, pos = P[n]
        lp = np.array(pos) if par is None else np.array(pos) - np.array(P[par][1])
        if n == 'mixamorigHips': lp = lp + np.array(off)
        M = np.eye(4); M[:3, :3] = mat_of(R.get(n, (0, 0, 0, 1))); M[:3, 3] = lp
        world[n] = M if par is None else world[par] @ M
    skin_m = {n: world[n] @ np.block([[np.eye(3), -np.array(P[n][1])[:, None]], [np.zeros((1, 3)), np.ones((1, 1))]]) for n in names}
    out = []
    for part in info['parts']:
        pos = np.array(part.pos); res = np.zeros_like(pos)
        for i, (p, j, w) in enumerate(zip(pos, part.joints, part.weights)):
            hp = np.append(p, 1.0)
            for k in range(2):
                if w[k] > 0: res[i] += w[k] * (skin_m[names[j[k]]] @ hp)[:3]
        out.append((part, res))
    return out

def preview(info, outdir, tag):
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.collections import PolyCollection
    cols = {'Skin': np.array(info['build']['skin'][:3]), 'Hair': np.array(info['build']['hair'][:3]), 'Cloth': np.array(info['build']['cloth_col'][:3]), 'Eyes': np.array([.05, .05, .06])}
    shots = [('rest', 'idle', 0.0, 3.0), ('walk', 'walk', 0.25, 1.0), ('run', 'run', 0.15, 0.62), ('mine', 'mine', 0.0, 0.9), ('swim', 'swim', 0.3, 1.2), ('death', 'death', 1.4, 1.5)]
    fig, axes = plt.subplots(2, len(shots), figsize=(3 * len(shots), 8))
    for c, (label, key, t, dur) in enumerate(shots):
        sk = skin_pose(info, key, t, dur)
        for r, view in enumerate(('side', 'front')):
            ax = axes[r][c]; polys = []; shade = []; depth = []
            for part, V in sk:
                for a, b, cc in part.tris:
                    tri = V[[a, b, cc]]
                    n = np.cross(tri[1] - tri[0], tri[2] - tri[0]); ln = np.linalg.norm(n)
                    if ln < 1e-12: continue
                    n /= ln
                    cam = np.array([1, 0, 0]) if view == 'side' else np.array([0, 0, 1])  # lihat dari sisi kiri karakter / dari depan
                    if np.dot(n, cam) <= 0: continue
                    xy = tri[:, [2, 1]] if view == 'side' else tri[:, [0, 1]]
                    if view == 'front': xy = xy * [-1, 1]
                    polys.append(xy); depth.append(float(tri[:, 0].mean() if view == 'side' else tri[:, 2].mean()))
                    shade.append(cols[part.material] * (0.45 + 0.55 * abs(np.dot(n, np.array([0.3, 0.6, 0.7]) / 0.97))))
            order = np.argsort(depth)
            ax.add_collection(PolyCollection([polys[i] for i in order], facecolors=[np.clip(shade[i], 0, 1) for i in order], edgecolors='none'))
            ax.set_xlim(-1.1, 1.1); ax.set_ylim(-0.1, 2.0); ax.set_aspect('equal'); ax.axis('off')
            ax.set_title(f'{label} ({view})', fontsize=8)
            ax.axhline(0, color='#888', lw=0.5)
    os.makedirs(outdir, exist_ok=True)
    fig.savefig(os.path.join(outdir, f'preview_{tag}.png'), dpi=70, bbox_inches='tight'); plt.close(fig)

if __name__ == '__main__':
    infos = {'adam': write_glb('primordia_adam.glb', ADAM), 'hawa': write_glb('primordia_hawa.glb', HAWA)}
    if '--preview' in sys.argv:
        d = sys.argv[sys.argv.index('--preview') + 1]
        for k, v in infos.items(): preview(v, d, k)
        print('pratinjau →', d)
