#!/usr/bin/env python3
"""Kompres tekstur di dalam .glb (resize + re-encode JPEG/WebP) tanpa library eksternal selain Pillow."""
import io, json, struct, sys, os
from PIL import Image

MAX_TEX = int(os.environ.get("MAX_TEX", "1024"))
QUALITY = int(os.environ.get("QUALITY", "72"))

def read_glb(p):
    b = open(p, "rb").read()
    magic, ver, length = struct.unpack_from("<4sII", b, 0)
    assert magic == b"glTF"
    off = 12; js = None; binc = b""
    while off < length:
        clen, ctype = struct.unpack_from("<II", b, off); off += 8
        chunk = b[off:off+clen]; off += clen
        if ctype == 0x4E4F534A: js = json.loads(chunk)
        elif ctype == 0x004E4942: binc = chunk
    return js, binc

def write_glb(p, js, binc):
    j = json.dumps(js, separators=(",", ":")).encode()
    j += b" " * ((4 - len(j) % 4) % 4)
    binc += b"\0" * ((4 - len(binc) % 4) % 4)
    total = 12 + 8 + len(j) + 8 + len(binc)
    with open(p, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<II", len(j), 0x4E4F534A)); f.write(j)
        f.write(struct.pack("<II", len(binc), 0x004E4942)); f.write(binc)

def compress(src, dst):
    js, binc = read_glb(src)
    views = js["bufferViews"]
    img_views = {}
    for i, im in enumerate(js.get("images", [])):
        if "bufferView" in im: img_views[im["bufferView"]] = i
    new_bin = bytearray(); new_views = []
    for vi, v in enumerate(views):
        data = binc[v.get("byteOffset", 0): v.get("byteOffset", 0) + v["byteLength"]]
        nv = dict(v)
        if vi in img_views:
            im = Image.open(io.BytesIO(data)); has_alpha = im.mode in ("RGBA", "LA", "P") and "A" in im.getbands()
            im.thumbnail((MAX_TEX, MAX_TEX), Image.LANCZOS)
            out = io.BytesIO()
            if has_alpha and im.getchannel("A").getextrema()[0] < 250:
                im.convert("RGBA").save(out, "PNG", optimize=True); mime = "image/png"
            else:
                im.convert("RGB").save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True); mime = "image/jpeg"
            data = out.getvalue()
            js["images"][img_views[vi]]["mimeType"] = mime
        pad = (4 - len(new_bin) % 4) % 4
        new_bin += b"\0" * pad
        nv["byteOffset"] = len(new_bin); nv["byteLength"] = len(data)
        new_bin += data; new_views.append(nv)
    js["bufferViews"] = new_views
    js["buffers"] = [{"byteLength": len(new_bin)}]
    write_glb(dst, js, bytes(new_bin))
    return os.path.getsize(src), os.path.getsize(dst)

if __name__ == "__main__":
    for s in sys.argv[1:]:
        d = os.path.join("public/play/models", os.path.basename(s))
        a, b = compress(s, d)
        print(f"{os.path.basename(s)}: {a/1e6:.2f}MB -> {b/1e6:.2f}MB")
