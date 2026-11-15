"""Turn the big AI-generated sheets in art/raw into game-size sprite strips.

For each sheet: split poses, align them on a shared anchor, scale down to game
resolution, harden alpha and reduce to a small shared palette. Writes
public/assets/<name>.png plus src/data/sprites.json (frame size + origin).

Run: python tools/slice_sheets.py
"""
import json
import os
from collections import deque
from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "art", "raw")
OUT = os.path.join(ROOT, "public", "assets")
META = os.path.join(ROOT, "src", "data", "sprites.json")

# mode "bodies": the N largest blobs are poses, small blobs join the nearest pose.
# mode "columns": poses are separated by empty vertical gaps (for effects made of many bits).
# anchor_x: "bbox" = centre of the pose's main blob, or explicit raw x per frame.
SHEETS = {
    "hunter": dict(file="hunter_sheet.png", frames=6, mode="bodies", target_h=44, colors=24,
                   anchor_x=[122, 372, 612, 836, 1128, 1412]),
    "dragon": dict(file="dragon_sheet.png", frames=4, mode="bodies", target_h=88, colors=40, anchor_x="bbox"),
    "slash": dict(file="slash_sheet.png", frames=5, mode="columns", target_h=64, colors=12, anchor_x="bbox"),
    "companions": dict(file="companions_sheet.png", frames=8, mode="bodies", target_h=28, colors=48, anchor_x="bbox",
                       saturate=1.3, method="octree"),
}
K = 2  # label map is computed at 1/K resolution


def label_components(mask):
    w, h = mask.size
    px = mask.load()
    labels = [[0] * w for _ in range(h)]
    comps = []  # (area, minx, miny, maxx, maxy)
    for y in range(h):
        for x in range(w):
            if px[x, y] == 0 or labels[y][x]:
                continue
            lab = len(comps) + 1
            labels[y][x] = lab
            q = deque([(x, y)])
            area, x0, y0, x1, y1 = 0, x, y, x, y
            while q:
                cx, cy = q.popleft()
                area += 1
                x0, y0, x1, y1 = min(x0, cx), min(y0, cy), max(x1, cx), max(y1, cy)
                for dx in (-1, 0, 1):
                    for dy in (-1, 0, 1):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and px[nx, ny] and not labels[ny][nx]:
                            labels[ny][nx] = lab
                            q.append((nx, ny))
            comps.append((area, x0, y0, x1, y1))
    return labels, comps


def box_gap(a, b):
    dx = max(0, max(a[1], b[1]) - min(a[3], b[3]))
    dy = max(0, max(a[2], b[2]) - min(a[4], b[4]))
    return (dx * dx + dy * dy) ** 0.5


def split_frames(cfg, comps):
    """Return a list (one per frame) of dict(main=comp index, members=set of comp indices)."""
    n = cfg["frames"]
    if cfg["mode"] == "bodies":
        order = sorted(range(len(comps)), key=lambda i: -comps[i][0])
        mains = sorted(order[:n], key=lambda i: comps[i][1])
        frames = [dict(main=m, members={m}) for m in mains]
        for i in order[n:]:
            if comps[i][0] < 6:
                continue  # speck
            best = min(frames, key=lambda f: box_gap(comps[i], comps[f["main"]]))
            best["members"].add(i)
        return frames
    # columns: group blobs whose x ranges are separated by less than a wide gap
    order = sorted((i for i in range(len(comps)) if comps[i][0] >= 6), key=lambda i: comps[i][1])
    groups = []
    for i in order:
        if groups and comps[i][1] - groups[-1]["x1"] < 30:
            groups[-1]["members"].add(i)
            groups[-1]["x1"] = max(groups[-1]["x1"], comps[i][3])
        else:
            groups.append(dict(members={i}, x1=comps[i][3]))
    assert len(groups) == n, f"expected {n} column groups, found {len(groups)}"
    for g in groups:
        g["main"] = max(g["members"], key=lambda i: comps[i][0])
    return groups


def process(name, cfg):
    im = Image.open(os.path.join(RAW, cfg["file"])).convert("RGBA")
    W, H = im.size
    alpha = im.getchannel("A").point(lambda v: 255 if v > 128 else 0)
    small = alpha.resize((W // K, H // K), Image.BOX).point(lambda v: 255 if v > 0 else 0)
    labels, comps = label_components(small)
    frames = split_frames(cfg, comps)

    def bbox(members):
        return (min(comps[i][1] for i in members) * K, min(comps[i][2] for i in members) * K,
                (max(comps[i][3] for i in members) + 1) * K, (max(comps[i][4] for i in members) + 1) * K)

    centred = cfg["mode"] == "columns"  # effects pivot on their centre, characters on their feet
    all_box = bbox(set().union(*(f["members"] for f in frames)))
    infos = []
    for idx, f in enumerate(frames):
        fb = bbox(f["members"])
        mb = bbox(f["members"]) if centred else bbox({f["main"]})
        ax = (mb[0] + mb[2]) // 2 if cfg["anchor_x"] == "bbox" else cfg["anchor_x"][idx]
        ay = (all_box[1] + all_box[3]) // 2 if centred else mb[3]
        infos.append(dict(box=fb, ax=ax, ay=ay, members=f["members"]))

    left = max(i["ax"] - i["box"][0] for i in infos)
    right = max(i["box"][2] - i["ax"] for i in infos)
    up = max(i["ay"] - i["box"][1] for i in infos)
    down = max(i["box"][3] - i["ay"] for i in infos)

    ref = infos[0]["box"] if not centred else max((i["box"] for i in infos), key=lambda b: b[3] - b[1])
    scale = cfg["target_h"] / (ref[3] - ref[1])
    fw, fh = round((left + right) * scale) + 2, round((up + down) * scale) + 2

    strip = Image.new("RGBA", (fw * len(infos), fh), (0, 0, 0, 0))
    px = im.load()
    for idx, info in enumerate(infos):
        cell = Image.new("RGBA", (left + right, up + down), (0, 0, 0, 0))
        cp = cell.load()
        x0, y0, x1, y1 = info["box"]
        ox, oy = left - info["ax"], up - info["ay"]
        for y in range(y0, min(y1, H)):
            row = labels[y // K]
            for x in range(x0, min(x1, W)):
                lab = row[x // K]
                if lab and (lab - 1) in info["members"]:
                    cp[x + ox, y + oy] = px[x, y]
        tiny = cell.convert("RGBa").resize((fw - 2, fh - 2), Image.BOX).convert("RGBA")
        strip.paste(tiny, (idx * fw + 1, 1))

    hard = strip.getchannel("A").point(lambda v: 255 if v > 110 else 0)
    # build the palette from visible pixels only, so the empty background doesn't eat colors
    rgb = strip.convert("RGB")
    if cfg.get("saturate"):  # small downscales go grey; push the colors back
        rgb = ImageEnhance.Color(rgb).enhance(cfg["saturate"])
    visible = [p for p, a in zip(rgb.get_flattened_data(), hard.get_flattened_data()) if a]
    sample = Image.new("RGB", (len(visible), 1))
    sample.putdata(visible)
    method = Image.Quantize.FASTOCTREE if cfg.get("method") == "octree" else Image.Quantize.MEDIANCUT
    palette = sample.quantize(colors=cfg["colors"], method=method, dither=Image.Dither.NONE)
    flat = rgb.quantize(palette=palette, dither=Image.Dither.NONE)
    out = flat.convert("RGBA")
    out.putalpha(hard)
    out.save(os.path.join(OUT, f"{name}.png"))
    meta = dict(frameWidth=fw, frameHeight=fh, frames=len(infos),
                originX=round((left * scale + 1) / fw, 4), originY=round((up * scale + 1) / fh, 4))
    print(name, meta, "scale=%.3f" % scale)
    return meta


if __name__ == "__main__":
    meta = {name: process(name, cfg) for name, cfg in SHEETS.items()}
    with open(META, "w") as fp:
        json.dump(meta, fp, indent=2)
