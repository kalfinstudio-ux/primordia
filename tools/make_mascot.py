#!/usr/bin/env python3
"""
Bruk, penjaga basal — generator maskot "realistis" (SVG murni, tanpa gambar raster).

Kenapa skrip: bentuk dasar (siluet kepala, tanduk, taring, retakan) berasal dari
ilustrasi datar lama; skrip ini memberinya material nyata:
  - batu basal  : peta tinggi (blur siluet + noise) -> feDiffuse/SpecularLighting,
                  pori-pori gelembung gas, tepi membulat (bevel) seperti pahatan
  - kristal     : gradien sepanjang sumbu tanduk, sisi bayangan, cincin tumbuh,
                  kilau spekular, cahaya dalam
  - lava        : celah dipahat (bibir gelap + sisi terang) dgn inti panas berlapis,
                  tepi dikasarkan feDisplacementMap, cabang retakan rambut
  - mata/taring : iris berserat, pantulan basah, kelopak & bayangan alis, taring
                  gading dgn pantulan hangat dari mulut
  - lapisan FX  : cahaya lava (blend screen), uap, bara -- terpisah dari lapisan
                  statis supaya filter berat tidak digambar ulang tiap frame

Pakai:
  python3 tools/make_mascot.py <out_dir>      (bentuk dasar: tools/mascot_shapes.json)
Menghasilkan di <out_dir>:
  hero_inline.html  (potongan HTML 3 lapis utk disisipkan di index.html)
  mascot.svg        (mandiri, 1 file, animasi CSS di dalamnya)
  favicon.svg       (versi ikon, latar rounded)
"""
import math
import random
import re
import sys

import json
import os
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else "."

# ---------------------------------------------------------------- geometri
P = json.load(open(os.path.join(HERE, "mascot_shapes.json"), encoding="utf-8"))  # bentuk dasar (siluet) dari ilustrasi datar lama
CRACKS = ["c_fore", "c_right", "c_left", "c_chest", "c_b1", "c_b2", "c_b3", "c_b4", "c_b5"]
TEETH = ["t1", "t2", "t3", "t4", "t5", "t6", "tl", "tr"]


def pts(d):
    n = [float(v) for v in re.findall(r"-?\d+\.?\d*", d)]
    return list(zip(n[0::2], n[1::2]))


def poly(points, close=False):
    s = "M" + " L".join("%.1f %.1f" % p for p in points)
    return s + ("Z" if close else "")


RNG = random.Random(20261115)


# ---------------------------------------------------------------- filter
def blur(id_, sd, pad="60%"):
    return ('<filter id="%s" x="-%s" y="-%s" width="%s" height="%s" color-interpolation-filters="sRGB">'
            '<feGaussianBlur stdDeviation="%s"/></filter>' % (id_, pad, pad, "%d%%" % (100 + 2 * int(pad[:-1])),
                                                              "%d%%" % (100 + 2 * int(pad[:-1])), sd))


def blurU(id_, sd):
    """Blur dgn wilayah tetap (userSpace): wajib utk garis lurus/tipis yg bbox-nya nol (kalau tidak, glow terpotong)."""
    return ('<filter id="%s" filterUnits="userSpaceOnUse" x="-60" y="-60" width="520" height="520" '
            'color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="%s"/></filter>' % (id_, sd))


def rock(id_, sd=7, scale=5.0, lump=0.028, grain=0.7, seed=1, kd=1.32, spec=0.5, spec_exp=24,
         spec_col="#d6f4f0", k_soft=0.55, a_lump=0.35, a_grain=0.10, pores=0.0, light="#ffffff",
         az=228, el=50, lite=False, mottle=(1.9, -0.12), pore_freq=0.26):
    """Filter batu: tinggi = blur(alpha) + noise -> pencahayaan -> kalikan warna dasar."""
    f = ['<filter id="%s" x="-8%%" y="-8%%" width="116%%" height="116%%" color-interpolation-filters="sRGB">' % id_]
    if lite:  # ikon kecil: tanpa noise
        f.append('<feGaussianBlur in="SourceAlpha" stdDeviation="%s" result="h"/>' % sd)
    else:
        f.append('<feGaussianBlur in="SourceAlpha" stdDeviation="%s" result="soft"/>' % sd)
        f.append('<feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="4" seed="%d" result="n1"/>' % (lump, seed))
        f.append('<feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="2" seed="%d" result="n2"/>' % (grain, seed + 3))
        ra = '<feColorMatrix in="%s" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 0 0 0 0" result="%s"/>'
        f.append(ra % ("n1", "a1"))
        f.append(ra % ("n2", "a2"))
        f.append('<feComposite in="soft" in2="a1" operator="arithmetic" k1="0" k2="%s" k3="%s" k4="0" result="h1"/>' % (k_soft, a_lump))
        f.append('<feComposite in="h1" in2="a2" operator="arithmetic" k1="0" k2="1" k3="%s" k4="0" result="h"/>' % a_grain)
    L = '<feDistantLight azimuth="%d" elevation="%d"/>' % (az, el)
    f.append('<feDiffuseLighting in="h" surfaceScale="%s" diffuseConstant="%s" lighting-color="%s" result="dif">%s</feDiffuseLighting>' % (scale, kd, light, L))
    f.append('<feSpecularLighting in="h" surfaceScale="%s" specularConstant="%s" specularExponent="%s" lighting-color="%s" result="spc">%s</feSpecularLighting>' % (scale, spec, spec_exp, spec_col, L))
    f.append('<feBlend in="dif" in2="SourceGraphic" mode="multiply" result="mul"/>')
    f.append('<feComposite in="spc" in2="mul" operator="arithmetic" k1="0" k2="1" k3="1" k4="0" result="lit"/>')
    last = "lit"
    if mottle and not lite:
        # variasi tona skala besar (bercak gelap/terang) -> permukaan tidak seragam
        f.append('<feColorMatrix in="n1" type="matrix" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1" result="g1"/>')
        f.append('<feComponentTransfer in="g1" result="g2"><feFuncR type="linear" slope="%s" intercept="%s"/>'
                 '<feFuncG type="linear" slope="%s" intercept="%s"/><feFuncB type="linear" slope="%s" intercept="%s"/></feComponentTransfer>'
                 % (mottle[0], mottle[1], mottle[0], mottle[1], mottle[0] * 1.05, mottle[1]))
        f.append('<feComposite in="lit" in2="g2" operator="arithmetic" k1="1" k2="0" k3="0" k4="0" result="lit2"/>')
        last = "lit2"
    if pores and not lite:
        thr = pores
        f.append('<feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="2" seed="%d" result="pn"/>' % (pore_freq, seed + 9))
        f.append('<feColorMatrix in="pn" type="matrix" values="0 0 0 0 .012  0 0 0 0 .017  0 0 0 0 .02  14 0 0 0 %s" result="pits"/>' % (-14 * thr))
        f.append('<feMerge result="pit"><feMergeNode in="%s"/><feMergeNode in="pits"/></feMerge>' % last)
        last = "pit"
    f.append('<feComposite in="%s" in2="SourceAlpha" operator="in"/>' % last)
    f.append("</filter>")
    return "".join(f)


def rough(id_, freq=0.085, scale=3.2, seed=4):
    return ('<filter id="%s" x="-5%%" y="-5%%" width="110%%" height="110%%" color-interpolation-filters="sRGB">'
            '<feTurbulence type="fractalNoise" baseFrequency="%s" numOctaves="2" seed="%d" result="t"/>'
            '<feDisplacementMap in="SourceGraphic" in2="t" scale="%s" xChannelSelector="R" yChannelSelector="G"/>'
            '</filter>' % (id_, freq, seed, scale))


# ---------------------------------------------------------------- bagian
def crack_stroke(href, w, extra=""):
    return '<use href="#p_%s" fill="none" stroke-linecap="round" stroke-linejoin="round" %s/>' % (href, extra)


def branches(name, count, seed):
    """Retakan rambut yang bercabang dari retakan utama (deterministik)."""
    r = random.Random(seed)
    p = pts(P[name])
    out = []
    for _ in range(count):
        i = r.randint(2, len(p) - 3)
        x, y = p[i]
        tx, ty = p[i + 1][0] - p[i - 1][0], p[i + 1][1] - p[i - 1][1]
        ang = math.atan2(ty, tx) + r.choice((-1, 1)) * math.radians(r.uniform(30, 75))
        ln = r.uniform(8, 24)
        seg = [(x, y)]
        for _k in range(4):
            ang += math.radians(r.uniform(-28, 28))
            x += math.cos(ang) * ln / 4
            y += math.sin(ang) * ln / 4
            seg.append((x, y))
        out.append(poly(seg))
    return out


def radial_fibers(cx, cy, r0, r1, n, seed, color, op, w):
    r = random.Random(seed)
    s = []
    for k in range(n):
        a = 2 * math.pi * k / n + r.uniform(-0.05, 0.05)
        a0 = r.uniform(r0, r0 + 3)
        a1 = r.uniform(r1 * 0.7, r1)
        wob = r.uniform(-.12, .12)
        s.append("M%.1f %.1f L%.1f %.1f" % (cx + math.cos(a) * a0 * .8, cy + math.sin(a) * a0 * 1.25,
                                          cx + math.cos(a + wob) * a1 * .95, cy + math.sin(a + wob) * a1 * 1.3))
    return '<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (" ".join(s), color, op, w)


def facets(bbox, n, seed, light="#fff3a0", dark="#4a3d00"):
    r = random.Random(seed)
    x0, y0, x1, y1 = bbox
    s = []
    for _ in range(n):
        cx, cy = r.uniform(x0, x1), r.uniform(y0, y1)
        k = r.uniform(5, 13)
        a = r.uniform(0, 6.28)
        tri = [(cx + math.cos(a + j * 2.094) * k * r.uniform(.6, 1.2), cy + math.sin(a + j * 2.094) * k * r.uniform(.6, 1.2)) for j in range(3)]
        col, op = (light, r.uniform(.14, .30)) if r.random() < .5 else (dark, r.uniform(.16, .32))
        s.append('<path d="%s" fill="%s" fill-opacity="%.2f"/>' % (poly(tri, True), col, op))
    return "".join(s)


def ring_lines(p0, p1, n, spread, seed, color, op, w):
    """Garis tumbuh melintang di sepanjang sumbu tanduk (melengkung sedikit)."""
    r = random.Random(seed)
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    L = math.hypot(dx, dy)
    nx, ny = -dy / L, dx / L
    s = []
    for k in range(n):
        t = (k + 1) / (n + 1) + r.uniform(-.02, .02)
        cx, cy = x0 + dx * t, y0 + dy * t
        half = spread * (1 - t * .75)
        bend = r.uniform(2, 5) * (1 - t * .5)
        s.append("M%.1f %.1f Q%.1f %.1f %.1f %.1f" % (cx - nx * half, cy - ny * half,
                                                     cx + dx / L * bend, cy + dy / L * bend,
                                                     cx + nx * half, cy + ny * half))
    return '<path d="%s" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s" stroke-linecap="round"/>' % (" ".join(s), color, op, w)


def smooth_noise(seed, n):
    r = random.Random(seed)
    comps = [(r.uniform(.8, 1.6), r.uniform(0, 6.28), r.uniform(.5, 1.0)),
             (r.uniform(2.2, 4.0), r.uniform(0, 6.28), r.uniform(.3, .6)),
             (r.uniform(5, 9), r.uniform(0, 6.28), r.uniform(.15, .3))]
    tot = sum(c[2] for c in comps)
    return [sum(a * math.sin(2 * math.pi * f * (i / max(1, n - 1)) + ph) for f, ph, a in comps) / tot for i in range(n)]


def ribbon(d, W, seed, floor=0.0, vary=.45, step=2, offset=(0, 0), end_taper=True):
    """Poligon pita di sepanjang polyline: lebar berubah-ubah, meruncing di ujung -> retakan alami, bukan tabung."""
    p = pts(d)
    p = p[::step] + ([p[-1]] if (len(p) - 1) % step else [])
    n = len(p)
    nz = smooth_noise(seed, n)
    L, R = [], []
    for i, (x, y) in enumerate(p):
        a, b = p[max(0, i - 1)], p[min(n - 1, i + 1)]
        tx, ty = b[0] - a[0], b[1] - a[1]
        ln = math.hypot(tx, ty) or 1
        nx, ny = -ty / ln, tx / ln
        t = i / max(1, n - 1)
        prof = math.sin(math.pi * t) ** .55 if end_taper else 1.0
        w = W * prof * (1 + vary * nz[i])
        w = max(0.0, w - floor)  # floor>0: bagian tipis lapisan panas "putus"
        L.append((x + nx * w / 2 + offset[0], y + ny * w / 2 + offset[1]))
        R.append((x - nx * w / 2 + offset[0], y - ny * w / 2 + offset[1]))
    return "M" + " L".join("%.1f %.1f" % q for q in L + R[::-1]) + "Z"


# ---------------------------------------------------------------- rakit
def build(lite=False):
    """Mengembalikan dict: defs, base, eye (glow mata), lava (glow lava), fx (uap+bara)."""
    defs = []
    for k in ["body", "chest", "head", "hlL", "hlR", "hornL", "hornLhl", "hornR", "hornRhl", "cheekL", "cheekR",
              "browL", "browR", "eyeL", "pupilL", "eyeR", "scar", "snout", "nosL", "nosR", "mouth",
              "c_core"] + TEETH + CRACKS:
        defs.append('<path id="p_%s" d="%s"/>' % (k, P[k]))
    for k in ["head", "mouth", "eyeL", "eyeR", "hornL", "hornR", "cheekL", "cheekR", "snout", "body"]:
        defs.append('<clipPath id="cp_%s"><use href="#p_%s"/></clipPath>' % (k, k))

    # --- filter
    defs.append(blur("b1", 1.0)); defs.append(blur("b2", 2.2)); defs.append(blur("b4", 4)); defs.append(blur("b7", 7))
    defs.append(blur("b12", 12, "80%")); defs.append(blur("b22", 22, "90%"))
    defs.append(blurU("u1", 1.0)); defs.append(blurU("u2", 2.2)); defs.append(blurU("u7", 7)); defs.append(blurU("u12", 12))
    defs.append(rough("fRough", 0.07, 5.0, 4))
    defs.append(rough("fRough2", 0.14, 1.8, 9))
    defs.append(rock("rBody", sd=16, scale=7, lump=0.016, grain=0.9, seed=21, kd=1.50, spec=.30, spec_exp=14, a_lump=.55, a_grain=.035, pores=.74, mottle=(2.0, -.16), lite=lite))
    defs.append(rock("rJaw", sd=9, scale=6, lump=0.025, grain=0.9, seed=33, kd=1.50, spec=.30, spec_exp=18, a_lump=.5, a_grain=.035, pores=.76, mottle=(2.0, -.16), lite=lite))
    defs.append(rock("rHead", sd=11, scale=7.5, lump=0.018, grain=0.9, seed=7, kd=1.50, spec=.50, spec_exp=20, a_lump=.55, a_grain=.04, pores=.74, mottle=(2.1, -.2), lite=lite))
    defs.append(rock("rBone", sd=7, scale=5, lump=0.030, grain=0.9, seed=12, kd=1.40, spec=.45, spec_exp=22, a_grain=.04, pores=.78, mottle=(1.8, -.1), lite=lite))
    defs.append(rock("rBrow", sd=4.2, scale=5.5, lump=0.04, grain=0.9, seed=17, kd=1.5, spec=.6, spec_exp=16, a_grain=.04, pores=0, mottle=(1.6, -.05), lite=lite))
    defs.append(rock("rSnout", sd=5, scale=4.5, lump=0.05, grain=0.9, seed=41, kd=1.5, spec=.5, spec_exp=18, a_grain=.04, pores=.74, mottle=(1.7, -.08), lite=lite))
    defs.append(rock("rTooth", sd=1.1, scale=2.6, lump=0.12, grain=1.1, seed=51, kd=1.5, spec=1.0, spec_exp=46, spec_col="#fff7e6", a_lump=.16, a_grain=.04, mottle=(.6, .6), lite=lite))
    defs.append(rock("rSulfur", sd=3.2, scale=4.8, lump=0.09, grain=0.9, seed=61, kd=1.15, spec=1.0, spec_exp=28, spec_col="#fffbd0", a_lump=.5, a_grain=.10, mottle=(.7, .55), lite=lite))
    defs.append(rock("rHorn", sd=5.5, scale=5.5, lump=0.05, grain=0.5, seed=71, kd=1.35, spec=.7, spec_exp=40, spec_col="#d8fff9", a_lump=.12, a_grain=.03, k_soft=.65, mottle=(1.0, .0), lite=lite))

    # --- gradien
    G = []
    G.append('<radialGradient id="gHead" gradientUnits="userSpaceOnUse" cx="160" cy="118" r="250">'
             '<stop offset="0" stop-color="#506268"/><stop offset=".32" stop-color="#33444a"/>'
             '<stop offset=".62" stop-color="#202c31"/><stop offset="1" stop-color="#0f171a"/></radialGradient>')
    G.append('<linearGradient id="gBody" gradientUnits="userSpaceOnUse" x1="0" y1="255" x2="0" y2="412">'
             '<stop offset="0" stop-color="#2f3d42"/><stop offset=".5" stop-color="#1c262a"/><stop offset="1" stop-color="#10171a"/></linearGradient>')
    G.append('<radialGradient id="gBodyL" gradientUnits="userSpaceOnUse" cx="110" cy="290" r="200">'
             '<stop offset="0" stop-color="#8fa6ac" stop-opacity=".30"/><stop offset="1" stop-color="#8fa6ac" stop-opacity="0"/></radialGradient>')
    G.append('<linearGradient id="gJaw" gradientUnits="userSpaceOnUse" x1="0" y1="242" x2="0" y2="334">'
             '<stop offset="0" stop-color="#2c3a40"/><stop offset="1" stop-color="#172125"/></linearGradient>')
    G.append('<linearGradient id="gBrow" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">'
             '<stop offset="0" stop-color="#4a5a60"/><stop offset=".5" stop-color="#1c262a"/><stop offset="1" stop-color="#0c1113"/></linearGradient>')
    G.append('<radialGradient id="gSnout" gradientUnits="userSpaceOnUse" cx="195" cy="236" r="60">'
             '<stop offset="0" stop-color="#43555b"/><stop offset="1" stop-color="#1e2a2f"/></radialGradient>')
    G.append('<radialGradient id="gBone" gradientUnits="objectBoundingBox" cx=".35" cy=".3" r=".85">'
             '<stop offset="0" stop-color="#627479"/><stop offset="1" stop-color="#2f3e43"/></radialGradient>')
    G.append('<linearGradient id="gHornL" gradientUnits="userSpaceOnUse" x1="132" y1="116" x2="60" y2="10">'
             '<stop offset="0" stop-color="#0d6a62"/><stop offset=".35" stop-color="#26a396"/>'
             '<stop offset=".75" stop-color="#58d8c8"/><stop offset="1" stop-color="#b6fff3"/></linearGradient>')
    G.append('<linearGradient id="gHornR" gradientUnits="userSpaceOnUse" x1="280" y1="124" x2="321" y2="58">'
             '<stop offset="0" stop-color="#0d6a62"/><stop offset=".35" stop-color="#26a396"/>'
             '<stop offset=".75" stop-color="#58d8c8"/><stop offset="1" stop-color="#b6fff3"/></linearGradient>')
    G.append('<linearGradient id="gHornShade" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="1">'
             '<stop offset="0" stop-color="#02201e" stop-opacity="0"/><stop offset=".55" stop-color="#02201e" stop-opacity=".1"/>'
             '<stop offset="1" stop-color="#02201e" stop-opacity=".5"/></linearGradient>')
    G.append('<linearGradient id="gSpecL" gradientUnits="userSpaceOnUse" x1="95" y1="70" x2="64" y2="14">'
             '<stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".4" stop-color="#e6fffb" stop-opacity=".42"/>'
             '<stop offset="1" stop-color="#fff" stop-opacity=".5"/></linearGradient>')
    G.append('<linearGradient id="gSpecR" gradientUnits="userSpaceOnUse" x1="299" y1="97" x2="320" y2="60">'
             '<stop offset="0" stop-color="#fff" stop-opacity=".0"/><stop offset=".4" stop-color="#e6fffb" stop-opacity=".42"/>'
             '<stop offset="1" stop-color="#fff" stop-opacity=".5"/></linearGradient>')
    G.append('<radialGradient id="gHornRoot" gradientUnits="objectBoundingBox" cx=".7" cy=".8" r=".55">'
             '<stop offset="0" stop-color="#021412" stop-opacity=".8"/><stop offset="1" stop-color="#021412" stop-opacity="0"/></radialGradient>')
    G.append('<radialGradient id="gIris" gradientUnits="userSpaceOnUse" cx="151" cy="198" r="34">'
             '<stop offset="0" stop-color="#ffe27a"/><stop offset=".35" stop-color="#ffbb2a"/>'
             '<stop offset=".7" stop-color="#e07c10"/><stop offset=".92" stop-color="#8a3a06"/><stop offset="1" stop-color="#3a1604"/></radialGradient>')
    G.append('<linearGradient id="gSlit" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">'
             '<stop offset="0" stop-color="#4a2006"/><stop offset=".3" stop-color="#d98a1a"/><stop offset=".55" stop-color="#ffc040"/>'
             '<stop offset=".85" stop-color="#b8650f"/><stop offset="1" stop-color="#3a1805"/></linearGradient>')
    G.append('<radialGradient id="gSocket" gradientUnits="objectBoundingBox" cx=".5" cy=".5" r=".5">'
             '<stop offset=".35" stop-color="#03070a" stop-opacity=".0"/><stop offset=".62" stop-color="#03070a" stop-opacity=".7"/>'
             '<stop offset="1" stop-color="#03070a" stop-opacity="0"/></radialGradient>')
    G.append('<radialGradient id="gMouth" gradientUnits="userSpaceOnUse" cx="203" cy="296" r="86">'
             '<stop offset="0" stop-color="#ffd27a"/><stop offset=".22" stop-color="#ff8a2e"/>'
             '<stop offset=".5" stop-color="#e24c14"/><stop offset=".82" stop-color="#8a2208"/><stop offset="1" stop-color="#3a0e05"/></radialGradient>')
    G.append('<linearGradient id="gMouthTop" gradientUnits="userSpaceOnUse" x1="0" y1="270" x2="0" y2="298">'
             '<stop offset="0" stop-color="#120503" stop-opacity=".92"/><stop offset="1" stop-color="#120503" stop-opacity="0"/></linearGradient>')
    G.append('<linearGradient id="gTooth" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="0" y2="1">'
             '<stop offset="0" stop-color="#8f8466"/><stop offset=".18" stop-color="#e8e0c8"/>'
             '<stop offset=".62" stop-color="#f1ead4"/><stop offset=".9" stop-color="#e9b979"/><stop offset="1" stop-color="#ffcf8a"/></linearGradient>')
    G.append('<linearGradient id="gToothSide" gradientUnits="objectBoundingBox" x1="0" y1="0" x2="1" y2="0">'
             '<stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".45" stop-color="#3a2d12" stop-opacity="0"/>'
             '<stop offset="1" stop-color="#2a1d08" stop-opacity=".5"/></linearGradient>')
    G.append('<linearGradient id="gSulfur" gradientUnits="objectBoundingBox" x1=".2" y1="0" x2=".8" y2="1">'
             '<stop offset="0" stop-color="#f4e45c"/><stop offset=".5" stop-color="#c7b123"/><stop offset="1" stop-color="#7a6a10"/></linearGradient>')
    G.append('<radialGradient id="gNos" gradientUnits="objectBoundingBox" cx=".5" cy=".75" r=".7">'
             '<stop offset="0" stop-color="#b8420f"/><stop offset=".5" stop-color="#3a1307"/><stop offset="1" stop-color="#0a0403"/></radialGradient>')
    G.append('<radialGradient id="gBackGlow" gradientUnits="userSpaceOnUse" cx="200" cy="170" r="250">'
             '<stop offset="0" stop-color="#4fa89f" stop-opacity=".16"/><stop offset=".6" stop-color="#2f6a6a" stop-opacity=".06"/><stop offset="1" stop-color="#2f6a6a" stop-opacity="0"/></radialGradient>')
    G.append('<radialGradient id="gGround" gradientUnits="userSpaceOnUse" cx="200" cy="395" r="230" gradientTransform="translate(0 395) scale(1 .22) translate(0 -395)">'
             '<stop offset="0" stop-color="#ff6a2a" stop-opacity=".30"/><stop offset="1" stop-color="#ff6a2a" stop-opacity="0"/></radialGradient>')
    G.append('<linearGradient id="gFade" gradientUnits="userSpaceOnUse" x1="0" y1="340" x2="0" y2="412">'
             '<stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>')
    G.append('<mask id="mFade" maskUnits="userSpaceOnUse" x="-60" y="-40" width="520" height="480"><rect x="-60" y="-40" width="520" height="380" fill="#fff"/>'
             '<rect x="-60" y="340" width="520" height="100" fill="url(#gFade)"/></mask>')
    # cahaya
    G.append('<radialGradient id="gHalo" gradientUnits="userSpaceOnUse" cx="151" cy="198" r="70">'
             '<stop offset="0" stop-color="#ffb020" stop-opacity=".62"/><stop offset=".35" stop-color="#ff8a1a" stop-opacity=".28"/>'
             '<stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient>')
    G.append('<radialGradient id="gHaloBig" gradientUnits="userSpaceOnUse" cx="151" cy="198" r="150">'
             '<stop offset="0" stop-color="#ff9a2a" stop-opacity=".20"/><stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient>')
    G.append('<radialGradient id="gMouthGlow" gradientUnits="userSpaceOnUse" cx="203" cy="300" r="120">'
             '<stop offset="0" stop-color="#ff7a22" stop-opacity=".42"/><stop offset="1" stop-color="#ff5a14" stop-opacity="0"/></radialGradient>')
    G.append('<radialGradient id="gPuff" cx=".5" cy=".5" r=".5">'
             '<stop offset="0" stop-color="#e6eeec" stop-opacity=".34"/><stop offset=".6" stop-color="#cfdad8" stop-opacity=".12"/>'
             '<stop offset="1" stop-color="#cfdad8" stop-opacity="0"/></radialGradient>')
    G.append('<radialGradient id="gEmber" cx=".5" cy=".5" r=".5">'
             '<stop offset="0" stop-color="#fff2c0"/><stop offset=".35" stop-color="#ffb030"/><stop offset="1" stop-color="#ff5a14" stop-opacity="0"/></radialGradient>')
    defs += G

    # ------------------------------------------------------------ BASE
    B = []
    B.append('<ellipse cx="200" cy="170" rx="250" ry="230" fill="url(#gBackGlow)"/>')
    B.append('<ellipse cx="200" cy="398" rx="235" ry="52" fill="url(#gGround)"/>')
    B.append('<g mask="url(#mFade)">')

    # badan (bahu)
    B.append('<g filter="url(#rBody)"><use href="#p_body" fill="url(#gBody)"/><use href="#p_body" fill="url(#gBodyL)"/></g>')
    # retakan pelat batuan di bahu (pahatan halus)
    B.append('<g clip-path="url(#cp_body)"><use href="#p_body" fill="none" stroke="#000" stroke-width="40" stroke-opacity=".45" filter="url(#b12)" transform="translate(-10 -14)"/></g>')
    B.append('<g clip-path="url(#cp_body)" fill="none" stroke-linecap="round" stroke-linejoin="round">'
             '<path d="M30 372 Q70 346 112 338 M300 332 Q352 340 392 372 M58 392 Q120 374 160 380 M242 386 Q300 372 352 392" stroke="#05090b" stroke-opacity=".5" stroke-width="2.4"/>'
             '<path d="M31 374 Q71 348 113 340 M301 334 Q353 342 393 374" stroke="#8aa0a6" stroke-opacity=".16" stroke-width="1.2"/></g>')

    # rahang / leher
    B.append('<use href="#p_chest" fill="#000" fill-opacity=".55" filter="url(#b12)" transform="translate(2 12)"/>')
    B.append('<g filter="url(#rJaw)"><use href="#p_chest" fill="url(#gJaw)"/></g>')

    # bayangan kepala ke badan
    B.append('<use href="#p_head" fill="#000" fill-opacity=".62" filter="url(#b12)" transform="translate(4 20)"/>')
    # kepala
    B.append('<g filter="url(#rHead)"><use href="#p_head" fill="url(#gHead)"/></g>')
    # pelapukan kepala: noda lembap & cahaya pantul hangat dari bawah (lava)
    B.append('<g clip-path="url(#cp_head)">'
             '<use href="#p_head" fill="none" stroke="#000" stroke-width="34" stroke-opacity=".5" filter="url(#b12)" transform="translate(-9 -11)"/>'
             '<ellipse cx="200" cy="330" rx="170" ry="52" fill="#ff6a2a" fill-opacity=".22" filter="url(#b22)"/>'
             '<ellipse cx="96" cy="232" rx="22" ry="80" fill="#02060a" fill-opacity=".38" filter="url(#b12)"/>'
             '<ellipse cx="312" cy="206" rx="20" ry="100" fill="#02060a" fill-opacity=".4" filter="url(#b12)"/>'
             '<path d="M120 124 Q132 96 170 90" stroke="#b9d2d6" stroke-opacity=".16" stroke-width="2.2" fill="none" filter="url(#b1)"/>'
             '</g>')
    # tulang alis (bidang menonjol)
    for k in ("hlL", "hlR"):
        B.append('<use href="#p_%s" fill="#000" fill-opacity=".35" filter="url(#b4)" transform="translate(2 6)"/>' % k)
        B.append('<g filter="url(#rBone)"><use href="#p_%s" fill="url(#gBone)" fill-opacity=".92"/></g>' % k)

    # pipi belerang (kristal)
    for k, box, sd in (("cheekL", (96, 195, 136, 236), 31), ("cheekR", (267, 222, 305, 263), 77)):
        B.append('<use href="#p_%s" fill="#000" fill-opacity=".55" filter="url(#b4)" transform="translate(2 5)"/>' % k)
        B.append('<g filter="url(#rSulfur)"><use href="#p_%s" fill="url(#gSulfur)"/></g>' % k)
        B.append('<g clip-path="url(#cp_%s)">%s</g>' % (k, facets(box, 11, sd)))

    # ---- tanduk kristal
    def horn(side):
        hid, hlid = "horn" + side, "horn" + side + "hl"
        grad = "gHorn" + side
        if side == "L":
            p0, p1, spread = (128, 112), (66, 18), 19
            spec = "gSpecL"
        else:
            p0, p1, spread = (282, 120), (318, 62), 15
            spec = "gSpecR"
        s = []
        s.append('<use href="#p_%s" fill="#000" fill-opacity=".5" filter="url(#b4)" transform="translate(5 8)"/>' % hid)
        s.append('<g filter="url(#rHorn)"><use href="#p_%s" fill="url(#%s)"/></g>' % (hid, grad))
        s.append('<g clip-path="url(#cp_%s)">' % hid)
        # sisi bayangan + cincin tumbuh + inklusi + cahaya dalam
        s.append('<use href="#p_%s" fill="url(#gHornShade)"/>' % hid)
        s.append(ring_lines(p0, p1, 6, spread, 5 if side == "L" else 6, "#c9fff6", .20, .7))
        s.append('<ellipse cx="%d" cy="%d" rx="20" ry="26" fill="url(#gHornRoot)"/>' % ((p0[0] + 4, p0[1] + 6) if side == "L" else (p0[0] - 2, p0[1] + 4)))
        s.append('<use href="#p_%s" fill="none" stroke="#bff8ef" stroke-opacity=".5" stroke-width="2" filter="url(#b1)"/>' % hid)
        s.append('</g>')
        # kilau spekular memanjang (sapuan terang) + titik
        s.append('<use href="#p_%s" fill="url(#%s)" filter="url(#b1)"/>' % (hlid, spec))
        return "".join(s)

    B.append(horn("L"))
    B.append(horn("R"))
    # akar tanduk menyatu dengan kulit batu (bayangan lembut + retakan kecil)
    B.append('<ellipse cx="136" cy="116" rx="30" ry="15" fill="#02080a" fill-opacity=".45" filter="url(#b7)" transform="rotate(-38 136 116)"/>')
    B.append('<ellipse cx="282" cy="122" rx="24" ry="12" fill="#02080a" fill-opacity=".45" filter="url(#b7)" transform="rotate(-30 282 122)"/>')

    # ---- mata kiri (terbuka)
    B.append('<ellipse cx="151" cy="198" rx="50" ry="38" fill="url(#gSocket)"/>')
    B.append('<g clip-path="url(#cp_eyeL)">'
             '<use href="#p_eyeL" fill="url(#gIris)"/>'
             + radial_fibers(151, 198, 7, 33, 70, 3, "#7a3305", .5, .8)
             + radial_fibers(151, 198, 9, 30, 46, 8, "#ffe9a0", .30, .6) +
             '<ellipse cx="151" cy="198" rx="40" ry="34" fill="none" stroke="#2a0f03" stroke-opacity=".55" stroke-width="7" filter="url(#b2)"/>'
             '<use href="#p_pupilL" fill="#080402" filter="url(#b1)"/>'
             '<use href="#p_browL" fill="#000" fill-opacity=".8" filter="url(#b7)" transform="translate(4 20)"/>'
             '<path d="M128 186 Q140 181 155 183" stroke="#fff" stroke-opacity=".95" stroke-width="5" stroke-linecap="round" fill="none" filter="url(#b1)"/>'
             '<ellipse cx="170" cy="207" rx="3.2" ry="2.4" fill="#fff" fill-opacity=".6"/>'
             '<path d="M126 205 Q150 222 176 206" stroke="#ffe2a0" stroke-opacity=".38" stroke-width="3" fill="none" filter="url(#b2)"/>'
             '</g>')
    B.append('<use href="#p_eyeL" fill="none" stroke="#06090a" stroke-width="3" stroke-linejoin="round"/>')
    B.append('<use href="#p_eyeL" fill="none" stroke="#8fa5ab" stroke-opacity=".34" stroke-width="1" transform="translate(0 2.4)" filter="url(#b1)"/>')

    # ---- mata kanan (menyipit, bekas luka)
    B.append('<ellipse cx="252" cy="196" rx="48" ry="26" fill="url(#gSocket)"/>')
    B.append('<g clip-path="url(#cp_eyeR)"><use href="#p_eyeR" fill="url(#gSlit)"/>'
             '<use href="#p_browR" fill="#000" fill-opacity=".85" filter="url(#b4)" transform="translate(0 14)"/>'
             '<path d="M226 202 Q252 208 280 198" stroke="#ffe2a0" stroke-opacity=".5" stroke-width="1.6" fill="none" filter="url(#b1)"/></g>')
    B.append('<use href="#p_eyeR" fill="none" stroke="#06090a" stroke-width="2.6" stroke-linejoin="round"/>')
    B.append('<use href="#p_eyeR" fill="none" stroke="#8fa5ab" stroke-opacity=".3" stroke-width="1" transform="translate(0 2.2)" filter="url(#b1)"/>')

    # ---- alis batu
    for k in ("browL", "browR"):
        B.append('<use href="#p_%s" fill="#000" fill-opacity=".6" filter="url(#b4)" transform="translate(0 7)"/>' % k)
        B.append('<g filter="url(#rBrow)"><use href="#p_%s" fill="url(#gBrow)"/></g>' % k)

    # ---- batang hidung (v2): punggung basal bersudut, BUKAN moncong bundar berlubang dua.
    # Moncong + lubang hidung lama membuat wajah Bruk terbaca seperti babi, jadi p_snout/p_nosL/p_nosR
    # tidak digambar lagi (datanya tetap di mascot_shapes.json bila mau dipakai ulang).
    RIDGE = "M188 207 L204 199 L219 206 L224 233 L215 258 L202 267 L192 255 L185 232 Z"
    B.append('<path d="%s" fill="#000" fill-opacity=".55" filter="url(#b4)" transform="translate(3 8)"/>' % RIDGE)
    B.append('<g filter="url(#rSnout)"><path d="%s" fill="url(#gSnout)"/></g>' % RIDGE)
    B.append('<path d="%s" fill="none" stroke="#06090a" stroke-opacity=".7" stroke-width="1.6" stroke-linejoin="round"/>' % RIDGE)
    B.append('<path d="M196 214 L203 232 L200 262" stroke="#9db2b8" stroke-opacity=".32" stroke-width="1.4" fill="none" filter="url(#b1)"/>')
    B.append('<path d="M206 214 L208 236 L204 252" stroke="#ff7a1a" stroke-opacity=".75" stroke-width="1.5" stroke-linecap="round" fill="none" filter="url(#b1)"/>')
    B.append('<path d="M190 250 Q202 262 217 250" stroke="#06090a" stroke-opacity=".55" stroke-width="3" fill="none" filter="url(#b2)"/>')

    # ---- mulut + taring
    B.append('<use href="#p_mouth" fill="#05080a" stroke="#05080a" stroke-width="5" stroke-linejoin="round"/>')
    B.append('<use href="#p_mouth" fill="url(#gMouth)"/>')
    B.append('<g clip-path="url(#cp_mouth)"><rect x="120" y="262" width="170" height="40" fill="url(#gMouthTop)"/>'
             '<ellipse cx="203" cy="314" rx="86" ry="10" fill="#1a0604" fill-opacity=".5" filter="url(#b4)"/></g>')
    B.append('<use href="#p_mouth" fill="none" stroke="#9db2b8" stroke-opacity=".28" stroke-width="1.2" transform="translate(0 2)" filter="url(#b1)"/>')
    for t in TEETH:
        B.append('<use href="#p_%s" fill="#000" fill-opacity=".5" filter="url(#b2)" transform="translate(2 3)"/>' % t)
    for t in TEETH:
        B.append('<g filter="url(#rTooth)"><use href="#p_%s" fill="url(#gTooth)"/></g>' % t)
        B.append('<use href="#p_%s" fill="url(#gToothSide)"/>' % t)
        B.append('<use href="#p_%s" fill="none" stroke="#2a2010" stroke-opacity=".55" stroke-width=".7" stroke-linejoin="round"/>' % t)
    # retak halus & noda gading
    tc = []
    for t in TEETH:
        p = pts(P[t])
        r = random.Random(zlib.crc32(t.encode()) % 997)
        i = r.randint(len(p) // 4, len(p) // 2)
        x, y = p[i]
        tc.append("M%.1f %.1f l%.1f %.1f l%.1f %.1f" % (x, y, r.uniform(-2, 2), r.uniform(5, 9), r.uniform(-2, 2), r.uniform(3, 7)))
    B.append('<path d="%s" stroke="#6d5f3e" stroke-opacity=".55" stroke-width=".6" fill="none"/>' % " ".join(tc))
    # AO gusi di pangkal taring
    B.append('<path d="M129 275 Q200 292 277 270" stroke="#0a0302" stroke-opacity=".55" stroke-width="5" fill="none" filter="url(#b2)" clip-path="url(#cp_mouth)"/>')

    # ---- retakan lava
    hi, sh, gv, lv = [], [], [], []
    W = 5.2
    for n_, ck in enumerate(CRACKS):
        s0 = 100 + n_ * 7
        hi.append('<path d="%s"/>' % ribbon(P[ck], W * 1.9, s0, offset=(1.7, 2.0)))
        sh.append('<path d="%s"/>' % ribbon(P[ck], W * 2.5, s0, offset=(-1.3, -1.4)))
        gv.append('<path d="%s"/>' % ribbon(P[ck], W * 1.8, s0))
        lv.append('<path fill="#9a2406" d="%s"/>' % ribbon(P[ck], W * 1.25, s0 + 1, vary=.35))
        lv.append('<path fill="#ff5a14" d="%s"/>' % ribbon(P[ck], W * .95, s0 + 2, vary=.5, floor=.3))
        lv.append('<path fill="#ff9a2e" d="%s"/>' % ribbon(P[ck], W * .66, s0 + 3, vary=.7, floor=.5))
        lv.append('<path fill="#ffe3a8" d="%s"/>' % ribbon(P[ck], W * .38, s0 + 4, vary=.9, floor=.8))
    B.append('<g filter="url(#fRough)">'
             '<g filter="url(#u1)" fill="#a9bcc1" fill-opacity=".36">%s</g>'
             '<g filter="url(#u1)" fill="#020506" fill-opacity=".66">%s</g>'
             '<g fill="#050808">%s</g>%s</g>' % ("".join(hi), "".join(sh), "".join(gv), "".join(lv)))
    # inti sangat panas di dahi
    B.append('<g filter="url(#fRough2)"><path fill="#fff6d0" d="%s"/></g>' % ribbon(P["c_core"], 2.3, 77, vary=.5, floor=.3) + '')
    # retakan rambut bercabang
    hair = []
    for ck, n, sd in (("c_fore", 3, 1), ("c_right", 3, 2), ("c_left", 2, 3), ("c_chest", 2, 4), ("c_b1", 4, 5),
                      ("c_b2", 3, 6), ("c_b3", 3, 7), ("c_b4", 2, 8), ("c_b5", 2, 9)):
        hair += branches(ck, n, sd)
    B.append('<g filter="url(#fRough2)" fill="none" stroke-linecap="round" stroke-linejoin="round">'
             '<path d="%s" stroke="#050808" stroke-width="1.9" stroke-opacity=".6"/>'
             '<path d="%s" stroke="#e8501a" stroke-width=".75" stroke-opacity=".95"/>'
             '<path d="%s" stroke="#ffb860" stroke-width=".3" stroke-opacity=".8"/></g>' % (" ".join(hair), " ".join(hair), " ".join(hair)))

    # ---- bekas luka (alur dipahat)
    B.append('<g filter="url(#u1)" fill="#a9bcc1" fill-opacity=".36"><path d="%s"/></g>' % ribbon(P["scar"], 6.4, 91, vary=.3, offset=(1.8, 1.6)))
    B.append('<path fill="#030505" d="%s"/>' % ribbon(P["scar"], 5.2, 91, vary=.35))
    B.append('<path fill="#2a0d05" d="%s"/>' % ribbon(P["scar"], 2.0, 92, vary=.8, floor=.4))

    B.append("</g>")  # mask fade
    base = "".join(B)

    # ------------------------------------------------------------ GLOW (blend screen)
    E = []
    E.append('<ellipse cx="151" cy="198" rx="190" ry="150" fill="url(#gHaloBig)"/>')
    E.append('<circle cx="151" cy="198" r="70" fill="url(#gHalo)"/>')
    E.append('<g clip-path="url(#cp_eyeL)"><circle cx="151" cy="198" r="34" fill="url(#gHalo)" fill-opacity=".8"/></g>')
    E.append('<ellipse cx="252" cy="196" rx="40" ry="14" fill="#ff9a2e" fill-opacity=".16" filter="url(#b7)"/>')
    eye = "".join(E)

    Lv = []
    Lv.append('<ellipse cx="203" cy="300" rx="130" ry="70" fill="url(#gMouthGlow)"/>')
    cs2 = 'fill="none" stroke-linecap="round" stroke-linejoin="round"'
    wide = "".join('<use href="#p_%s" stroke-width="24"/>' % c for c in CRACKS)
    mid = "".join('<use href="#p_%s" stroke-width="9"/>' % c for c in CRACKS)
    gl = ('<g filter="url(#u12)" %s stroke="#ff4a10" stroke-opacity=".30">%s</g>'
          '<g filter="url(#u2)" %s stroke="#ff7a24" stroke-opacity=".34">%s</g>'
          '<g filter="url(#u2)" %s stroke="#ffd070" stroke-opacity=".5"><use href="#p_c_core" stroke-width="5"/></g>' % (cs2, wide, cs2, mid, cs2))
    Lv.append("".join(gl))
    lava = "".join(Lv)

    # ------------------------------------------------------------ FX (uap + bara)
    X = []
    for cx, cy, r, dl in ((322, 52, 14, 0), (334, 30, 18, 1.6), (326, 8, 12, 3.2)):
        X.append('<circle class="steam" style="animation-delay:%ss" cx="%d" cy="%d" r="%d" fill="url(#gPuff)"/>' % (dl, cx, cy, r))
    er = random.Random(9)
    sources = [(200, 100), (203, 130), (298, 190), (110, 190), (196, 345), (150, 372), (250, 372), (230, 300), (170, 296), (70, 340), (340, 340)]
    for i in range(16):
        sx, sy = er.choice(sources)
        sx += er.uniform(-5, 5)
        X.append('<circle class="ember" style="--dx:%dpx;animation-delay:%.1fs;animation-duration:%.1fs" cx="%.0f" cy="%.0f" r="%.1f" fill="url(#gEmber)"/>'
                 % (er.randint(-26, 26), er.uniform(0, 6), er.uniform(3.6, 6.4), sx, sy, er.uniform(1.3, 3.0)))
    fx = "".join(X)
    return dict(defs="".join(defs), base=base, eye=eye, lava=lava, fx=fx)


CSS = """
.m-eye,.glow-eye{animation:mEye 5s ease-in-out infinite}
.m-lava,.glow-lava{animation:mLava 7s ease-in-out infinite}
.steam{animation:rise 5s ease-out infinite}
.ember{animation:ember 4.8s ease-out infinite;opacity:0}
@keyframes mEye{50%{opacity:.6}}
@keyframes mLava{35%{opacity:.62}70%{opacity:.9}}
@keyframes rise{0%{transform:translateY(8px) scale(.8);opacity:0}30%{opacity:.5}100%{transform:translateY(-34px) scale(1.5);opacity:0}}
@keyframes ember{0%{transform:translate(0,0) scale(1);opacity:0}12%{opacity:1}100%{transform:translate(var(--dx),-80px) scale(.25);opacity:0}}
@media (prefers-reduced-motion:reduce){.m-eye,.m-lava,.glow-eye,.glow-lava,.steam,.ember{animation:none}.ember{opacity:0}}
""".strip()

LABEL = "Bruk, the basalt warden: a horned stone creature with a glowing amber eye and lava cracks"
VB = "-20 -10 440 430"


def write(path, text):
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def main():
    full = build()
    # --- inline (3 lapis) : svg statis + svg cahaya (screen) + svg partikel (screen)
    inline = (
        '<div class="mascot" role="img" aria-label="%s">\n'
        '<svg class="m-base" xmlns="http://www.w3.org/2000/svg" viewBox="%s" aria-hidden="true" focusable="false">\n<defs>%s</defs>\n%s\n</svg>\n'
        '<svg class="m-eye" xmlns="http://www.w3.org/2000/svg" viewBox="%s" aria-hidden="true" focusable="false">%s</svg>\n'
        '<svg class="m-lava" xmlns="http://www.w3.org/2000/svg" viewBox="%s" aria-hidden="true" focusable="false">%s</svg>\n'
        '<svg class="m-fx" xmlns="http://www.w3.org/2000/svg" viewBox="%s" aria-hidden="true" focusable="false">%s</svg>\n'
        '</div>' % (LABEL, VB, full["defs"], full["base"], VB, full["eye"], VB, full["lava"], VB, full["fx"]))
    write(OUT + "/hero_inline.html", inline)

    # --- mandiri (satu file)
    solo = ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="%s" role="img" aria-label="%s">\n'
            '<style>%s</style>\n<defs>%s</defs>\n'
            '<rect x="-20" y="-10" width="440" height="430" fill="#0f1518"/>\n%s\n'
            '<g class="glow-eye" style="mix-blend-mode:screen">%s</g>\n<g class="glow-lava" style="mix-blend-mode:screen">%s</g>\n'
            '<g style="mix-blend-mode:screen">%s</g>\n</svg>\n'
            % (VB, LABEL, CSS, full["defs"], full["base"], full["eye"], full["lava"], full["fx"]))
    write(OUT + "/mascot.svg", solo)

    # --- ikon (rounded, tanpa filter noise berat, tanpa animasi)
    lite = build(lite=True)
    icon = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="30 -4 340 340" role="img" aria-label="%s">\n<defs>%s</defs>\n'
            '<rect x="30" y="-4" width="340" height="340" rx="68" fill="#0f1518"/>\n%s\n'
            '<g style="mix-blend-mode:screen">%s%s</g>\n</svg>\n' % (LABEL, lite["defs"], lite["base"], lite["eye"], lite["lava"]))
    write(OUT + "/favicon.svg", icon)
    write(OUT + "/mascot.css", CSS)
    print("ok", {k: len(v) for k, v in full.items()})


if __name__ == "__main__":
    main()
