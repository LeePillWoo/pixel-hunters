"""Placeholder pixel art generator.

Draws every non-GPT asset (items, UI, slime, backgrounds) straight to
public/assets as PNG. Replace any output file with real art later; the game only
cares about file names and frame sizes.

Run: python tools/gen_placeholder_art.py
"""
import os
import random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "assets")
os.makedirs(OUT_DIR, exist_ok=True)


def C(h, a=255):
    h = h.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), a)


OUTLINE = C("3a1e18")
CLEAR = (0, 0, 0, 0)


def new(w, h, fill=CLEAR):
    im = Image.new("RGBA", (w, h), fill)
    return im, ImageDraw.Draw(im)


def shift(col, k):
    """Lighten (k>1) or darken (k<1) a color."""
    r, g, b, a = col
    if k >= 1:
        f = k - 1
        return (int(r + (255 - r) * f), int(g + (255 - g) * f), int(b + (255 - b) * f), a)
    return (int(r * k), int(g * k), int(b * k), a)


def bevel(im, light=1.35, dark=0.72):
    """Auto shading: lit from the top-left, shadow on the bottom-right edge."""
    w, h = im.size
    src = im.copy().load()
    dst = im.load()

    def empty(x, y):
        return not (0 <= x < w and 0 <= y < h) or src[x, y][3] == 0

    for y in range(h):
        for x in range(w):
            if src[x, y][3] == 0:
                continue
            if empty(x + 1, y) or empty(x, y + 1):
                dst[x, y] = shift(src[x, y], dark)
            elif empty(x - 1, y) or empty(x, y - 1):
                dst[x, y] = shift(src[x, y], light)


def outline(im, col=OUTLINE):
    w, h = im.size
    src = im.load()
    out = im.copy()
    dst = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3] != 0:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and src[nx, ny][3] != 0:
                    dst[x, y] = col
                    break
    return out


def sparkle(d, x, y, col=C("fff6c8")):
    d.point([(x, y - 1), (x - 1, y), (x + 1, y), (x, y + 1)], fill=col)
    d.point((x, y), fill=C("ffffff"))


def finish(im, shade=True):
    if shade:
        bevel(im)
    return outline(im)


# ---------------------------------------------------------------- items (24x24)

def leaf():
    im, d = new(24, 24)
    d.polygon([(12, 3), (16, 7), (17, 13), (15, 18), (12, 20), (9, 18), (7, 13), (8, 7)], fill=C("5fb04a"))
    d.line([(12, 6), (12, 21)], fill=C("2f6e33"))
    d.line([(12, 10), (9, 8)], fill=C("2f6e33"))
    d.line([(12, 14), (15, 12)], fill=C("2f6e33"))
    return finish(im)


def herb_bundle():
    im, d = new(24, 24)
    g = C("4fa64a")
    d.polygon([(4, 6), (9, 5), (11, 10), (11, 16), (7, 13), (4, 10)], fill=g)
    d.polygon([(19, 6), (14, 5), (12, 10), (12, 16), (16, 13), (19, 10)], fill=g)
    d.polygon([(12, 2), (15, 6), (15, 12), (12, 16), (9, 12), (9, 6)], fill=C("6cc257"))
    d.rectangle([10, 16, 13, 21], fill=C("2f6e33"))
    bevel(im)
    d.rectangle([9, 16, 14, 17], fill=C("d8483e"))
    return outline(im)


def bottle(liquid, star=False):
    im, d = new(24, 24)
    glass = C("d9f1ee")
    d.rectangle([10, 5, 13, 9], fill=glass)
    px = im.load()
    for y in range(24):
        for x in range(24):
            if ((x - 11.5) / 6.5) ** 2 + ((y - 15) / 6.0) ** 2 <= 1:
                px[x, y] = glass if y < 12 else liquid
    bevel(im)
    d.rectangle([10, 2, 13, 4], fill=C("9a6a3c"))
    d.point([(8, 13), (8, 14), (9, 12)], fill=C("ffffff"))
    d.point([(13, 17), (10, 18)], fill=shift(liquid, 1.5))
    im = outline(im)
    if star:
        sparkle(ImageDraw.Draw(im), 19, 5)
    return im


def bone(big):
    im, d = new(24, 24)
    c = C("f6e3b8")
    if big:
        d.line([(7, 17), (17, 7)], fill=c, width=5)
        for cx, cy in ((5, 16), (8, 19), (16, 5), (19, 8)):
            d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=c)
    else:
        d.line([(9, 15), (15, 9)], fill=c, width=3)
        for cx, cy in ((8, 14), (10, 16), (14, 8), (16, 10)):
            d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=c)
    bevel(im, 1.5, 0.78)
    return outline(im)


def skull(horns):
    im, d = new(24, 24)
    c = C("f1e2c0") if not horns else C("f3d27a")
    d.ellipse([5, 4, 19, 17], fill=c)
    d.rectangle([8, 14, 16, 19], fill=c)
    if horns:
        d.polygon([(6, 8), (2, 2), (9, 5)], fill=C("fff0b0"))
        d.polygon([(18, 8), (22, 2), (15, 5)], fill=C("fff0b0"))
    bevel(im, 1.4, 0.78)
    dark = C("4a2a22")
    d.rectangle([8, 10, 10, 13], fill=dark)
    d.rectangle([14, 10, 16, 13], fill=dark)
    d.point([(12, 14), (12, 15)], fill=dark)
    for x in (10, 12, 14):
        d.line([(x, 17), (x, 19)], fill=dark)
    im = outline(im)
    if horns:
        sparkle(ImageDraw.Draw(im), 20, 13)
    return im


def hide(kind):
    im, d = new(24, 24)
    if kind == 1:
        d.polygon([(5, 8), (12, 5), (19, 8), (18, 16), (11, 19), (5, 15)], fill=C("b9773f"))
        bevel(im)
        d.line([(8, 10), (10, 12)], fill=C("7c4a24"))
        d.line([(14, 13), (16, 11)], fill=C("7c4a24"))
    elif kind == 2:
        d.polygon([(3, 4), (8, 6), (16, 6), (21, 4), (18, 11), (21, 19), (15, 17), (12, 20), (9, 17), (3, 19), (6, 11)],
                  fill=C("a8652f"))
        bevel(im)
        d.ellipse([9, 9, 15, 15], fill=C("c98a4c"))
    else:
        base = C("a8652f") if kind == 3 else C("9a3f34")
        d.rectangle([6, 8, 19, 17], fill=base)
        d.ellipse([16, 8, 21, 17], fill=shift(base, 0.8))
        d.ellipse([2, 7, 9, 18], fill=shift(base, 1.25))
        bevel(im)
        d.ellipse([4, 10, 7, 15], fill=shift(base, 0.6))
        d.point((5, 12), fill=shift(base, 1.25))
        if kind == 4:
            d.rectangle([12, 8, 14, 17], fill=C("f2c94c"))
    im = outline(im)
    if kind == 4:
        sparkle(ImageDraw.Draw(im), 19, 4)
    return im


def rock(col, specks=None):
    im, d = new(24, 24)
    d.polygon([(4, 17), (6, 10), (11, 6), (17, 8), (20, 14), (18, 19), (7, 20)], fill=col)
    d.polygon([(6, 10), (11, 6), (13, 11), (8, 14)], fill=shift(col, 1.3))
    d.polygon([(13, 11), (20, 14), (18, 19), (12, 19)], fill=shift(col, 0.82))
    bevel(im, 1.2, 0.7)
    if specks:
        d.point([(9, 16), (15, 10), (16, 16), (11, 12)], fill=specks)
    return outline(im)


def crystal(col, star=False):
    im, d = new(24, 24)
    lite, dark = shift(col, 1.45), shift(col, 0.75)
    d.polygon([(6, 10), (9, 13), (9, 20), (4, 20), (3, 14)], fill=dark)
    d.polygon([(18, 11), (21, 15), (20, 20), (15, 20), (15, 14)], fill=dark)
    d.polygon([(12, 2), (16, 8), (15, 20), (9, 20), (8, 8)], fill=col)
    d.polygon([(12, 2), (12, 20), (9, 20), (8, 8)], fill=lite)
    d.line([(4, 15), (6, 12)], fill=col)
    bevel(im, 1.15, 0.8)
    im = outline(im)
    if star:
        dd = ImageDraw.Draw(im)
        sparkle(dd, 19, 5)
        sparkle(dd, 4, 7)
    return im


def feather(mode):
    im, d = new(24, 24)
    d.polygon([(18, 3), (20, 7), (17, 13), (11, 19), (7, 20), (8, 15), (12, 8)], fill=C("e8e4da"))
    px = im.load()
    rainbow = [C("e8504a"), C("f29a3a"), C("f2d94c"), C("5cc063"), C("4a9be0"), C("9a62d6")]
    fire = [C("fff0a0"), C("ffd04a"), C("ff9a3a"), C("f0602e"), C("d8382e"), C("b02a34")]
    for y in range(24):
        for x in range(24):
            if px[x, y][3] == 0:
                continue
            if mode == 2:
                px[x, y] = C("f2c94c")
            elif mode == 3:
                px[x, y] = rainbow[min(5, max(0, (y - 3) // 3))]
            elif mode == 4:
                px[x, y] = fire[min(5, max(0, (y - 3) // 3))]
    bevel(im, 1.25, 0.8)
    d.line([(5, 21), (9, 17)], fill=C("8a6a4a"))
    d.line([(9, 17), (17, 6)], fill=C("ffffff") if mode != 1 else C("b8b0a0"))
    im = outline(im)
    if mode >= 3:
        sparkle(ImageDraw.Draw(im), 5, 6)
    return im


def horn():
    im, d = new(24, 24)
    d.polygon([(5, 20), (12, 20), (16, 13), (19, 3), (13, 8), (8, 14)], fill=C("f3e1b4"))
    bevel(im, 1.3, 0.75)
    for a, b in (((8, 15), (13, 18)), ((11, 11), (15, 14)), ((14, 8), (17, 10))):
        d.line([a, b], fill=C("c79a5c"))
    return outline(im)


def claw():
    im, d = new(24, 24)
    for ox in (0, 6, 12):
        d.polygon([(3 + ox, 7), (8 + ox, 6), (8 + ox, 13), (6 + ox, 20), (4 + ox, 13)], fill=C("f1e0c0"))
    px = im.load()
    for y in range(0, 10):
        for x in range(24):
            if px[x, y][3] != 0:
                px[x, y] = C("8a5a34")
    bevel(im, 1.25, 0.78)
    return outline(im)


def shell():
    im, d = new(24, 24)
    g = C("4f9a6a")
    d.polygon([(12, 3), (19, 7), (19, 15), (12, 21), (5, 15), (5, 7)], fill=g)
    d.polygon([(12, 7), (16, 9), (16, 14), (12, 17), (8, 14), (8, 9)], fill=shift(g, 0.8))
    d.line([(12, 3), (12, 21)], fill=shift(g, 1.4))
    bevel(im, 1.3, 0.72)
    return outline(im)


def pick():
    im, d = new(24, 24)
    d.line([(5, 20), (15, 10)], fill=C("9a6a3c"), width=2)
    d.polygon([(7, 7), (12, 4), (19, 5), (21, 11), (18, 9), (14, 8), (10, 10)], fill=C("f6e3b8"))
    bevel(im, 1.3, 0.75)
    im = outline(im)
    sparkle(ImageDraw.Draw(im), 5, 6)
    return im


def cloth():
    im, d = new(24, 24)
    t = C("3fb0a8")
    d.polygon([(4, 7), (19, 5), (20, 17), (5, 19)], fill=t)
    d.polygon([(4, 7), (19, 5), (19, 8), (4, 10)], fill=C("f2c94c"))
    d.line([(8, 12), (16, 11)], fill=shift(t, 1.5))
    d.line([(8, 15), (16, 14)], fill=shift(t, 1.5))
    bevel(im, 1.25, 0.75)
    im = outline(im)
    sparkle(ImageDraw.Draw(im), 20, 20)
    return im


def weapon(kind):
    im, d = new(24, 24)
    steel, gold, grip = C("cfd6e0"), C("f2c94c"), C("8a5a34")
    if kind == "sword":
        d.line([(9, 14), (19, 4)], fill=steel, width=3)
        d.line([(6, 12), (11, 17)], fill=gold, width=2)
        d.line([(4, 19), (7, 16)], fill=grip, width=2)
    elif kind == "great":
        d.line([(9, 15), (19, 5)], fill=steel, width=6)
        d.polygon([(17, 2), (21, 2), (21, 6)], fill=steel)
        d.line([(4, 11), (12, 19)], fill=gold, width=2)
        d.line([(3, 20), (7, 16)], fill=grip, width=3)
    elif kind == "dual":
        d.line([(5, 18), (18, 5)], fill=steel, width=2)
        d.line([(18, 18), (5, 5)], fill=C("e8b8a0"), width=2)
        d.line([(3, 20), (6, 17)], fill=grip, width=2)
        d.line([(20, 20), (17, 17)], fill=grip, width=2)
    else:
        d.rectangle([11, 9, 12, 21], fill=grip)
        d.rectangle([4, 3, 19, 10], fill=C("9aa3b0"))
        d.rectangle([4, 3, 6, 10], fill=gold)
        d.rectangle([17, 3, 19, 10], fill=gold)
    bevel(im, 1.3, 0.72)
    return outline(im)


def with_pips(im, tier):
    """Tier marks (1-4 yellow pips) baked into the bottom-right corner."""
    d = ImageDraw.Draw(im)
    for i in range(tier):
        x = 20 - i * 3
        d.rectangle([x - 1, 20, x + 2, 23], fill=OUTLINE)
        d.rectangle([x, 21, x + 1, 22], fill=C("ffd84a"))
    return im


def build_items():
    # Frame order must match src/data/items.ts (line * 4 + tier - 1, then extras).
    mats = [
        [leaf(), herb_bundle(), bottle(C("5cc063")), bottle(C("f0608a"), True)],
        [bone(False), bone(True), skull(False), skull(True)],
        [hide(1), hide(2), hide(3), hide(4)],
        [rock(C("9a9aa4")), rock(C("d8813f"), C("ffd08a")), crystal(C("4a9be0")), crystal(C("e85ac0"), True)],
        [feather(1), feather(2), feather(3), feather(4)],
    ]
    frames = []
    for line in mats:
        for t, im in enumerate(line):
            frames.append(with_pips(im, t + 1))
    frames += [horn(), claw(), shell(), None]
    frames += [pick(), cloth(), bottle(C("4a7be8"), True), None]
    frames += [weapon("sword"), weapon("great"), weapon("dual"), weapon("hammer")]
    sheet, _ = new(24 * 8, 24 * 4)
    for i, im in enumerate(frames):
        if im:
            sheet.paste(im, ((i % 8) * 24, (i // 8) * 24))
    sheet.save(os.path.join(OUT_DIR, "items.png"))


# ---------------------------------------------------------------- UI

def build_ui():
    # slot 34x34 (index 0 = open, 1 = locked)
    sheet, _ = new(68, 34)
    for i, (fill, edge) in enumerate(((C("5a4844"), C("6e5a54")), (C("332829"), C("3e3233")))):
        im, d = new(34, 34)
        d.rounded_rectangle([1, 1, 32, 32], 4, fill=fill)
        d.line([(4, 2), (29, 2)], fill=edge)
        d.line([(2, 4), (2, 29)], fill=edge)
        d.line([(4, 31), (29, 31)], fill=shift(fill, 0.8))
        im = outline(im, C("241a1c"))
        sheet.paste(im, (i * 34, 0))
    sheet.save(os.path.join(OUT_DIR, "slot.png"))

    def nine(name, size, r, fill, border, hi):
        im, d = new(size, size)
        d.rounded_rectangle([1, 1, size - 2, size - 2], r, fill=border)
        d.rounded_rectangle([3, 3, size - 4, size - 4], max(1, r - 2), fill=fill)
        d.line([(r, 2), (size - r - 1, 2)], fill=hi)
        im = outline(im, C("241a1c"))
        im.save(os.path.join(OUT_DIR, name))

    nine("panel.png", 24, 5, C("3a2e31"), C("8a6a55"), C("b08a6e"))
    nine("btn.png", 24, 4, C("a8794f"), C("c99a68"), C("e8c08a"))
    nine("btn_yellow.png", 24, 4, C("f2b632"), C("ffd84a"), C("fff2a8"))
    nine("btn_dark.png", 24, 4, C("4a3a3c"), C("6e5a54"), C("8a7468"))

    # chest 16x16: closed / full
    sheet, _ = new(32, 16)
    for i in range(2):
        im, d = new(16, 16)
        d.rectangle([2, 6, 13, 13], fill=C("c98a3c"))
        d.rectangle([2, 4, 13, 7], fill=C("e0a850"))
        bevel(im, 1.25, 0.75)
        d.line([(2, 8), (13, 8)], fill=C("7c4a24"))
        d.rectangle([7, 7, 8, 10], fill=C("ffd84a"))
        im = outline(im)
        if i == 1:
            dd = ImageDraw.Draw(im)
            sparkle(dd, 4, 2)
            sparkle(dd, 12, 2, C("ffe890"))
        sheet.paste(im, (i * 16, 0))
    sheet.save(os.path.join(OUT_DIR, "chest.png"))

    # coin 12x12
    im, d = new(12, 12)
    d.ellipse([2, 2, 9, 9], fill=C("f2b632"))
    bevel(im, 1.4, 0.75)
    d.line([(6, 4), (6, 7)], fill=C("fff2a8"))
    outline(im).save(os.path.join(OUT_DIR, "coin.png"))

    # 16x16 icons: storage, craft, sell, quest, plus, lock, train, heart, check, book, flame, hand, speaker on/off
    icons, _ = new(16 * 14, 16)

    def put(i, im):
        icons.paste(im, (i * 16, 0))

    im, d = new(16, 16)  # storage crate
    d.rectangle([2, 4, 13, 13], fill=C("b9773f"))
    bevel(im)
    d.line([(2, 7), (13, 7)], fill=C("7c4a24"))
    d.line([(7, 4), (7, 13)], fill=C("7c4a24"))
    put(0, outline(im))

    im, d = new(16, 16)  # craft hammer
    d.line([(4, 13), (9, 8)], fill=C("8a5a34"), width=2)
    d.polygon([(7, 3), (13, 3), (13, 9), (10, 9), (10, 6), (7, 6)], fill=C("aab2bf"))
    bevel(im)
    put(1, outline(im))

    im, d = new(16, 16)  # sell bag
    d.ellipse([3, 6, 12, 14], fill=C("c98a3c"))
    d.rectangle([6, 3, 9, 6], fill=C("c98a3c"))
    bevel(im)
    d.line([(5, 6), (10, 6)], fill=C("7c4a24"))
    d.point([(7, 9), (8, 9), (7, 11), (8, 11), (7, 10)], fill=C("ffd84a"))
    put(2, outline(im))

    im, d = new(16, 16)  # quest scroll
    d.rectangle([3, 3, 12, 13], fill=C("f1e2c0"))
    bevel(im, 1.15, 0.8)
    for y in (6, 8, 10):
        d.line([(5, y), (10, y)], fill=C("8a6a4a"))
    put(3, outline(im))

    im, d = new(16, 16)  # plus
    d.rectangle([7, 3, 8, 12], fill=C("8ee06a"))
    d.rectangle([3, 7, 12, 8], fill=C("8ee06a"))
    put(4, outline(im))

    im, d = new(16, 16)  # lock
    d.rectangle([4, 7, 11, 13], fill=C("9aa3b0"))
    d.arc([5, 2, 10, 10], 180, 360, fill=C("9aa3b0"))
    bevel(im)
    d.point([(7, 10), (8, 10), (7, 11), (8, 11)], fill=C("3a2e31"))
    put(5, outline(im))

    im, d = new(16, 16)  # train (flexed arm -> simple up arrow)
    d.polygon([(8, 2), (13, 8), (10, 8), (10, 13), (5, 13), (5, 8), (2, 8)], fill=C("ff8a4a"))
    bevel(im)
    put(6, outline(im))

    im, d = new(16, 16)  # heart
    d.polygon([(8, 13), (2, 7), (2, 4), (4, 3), (6, 3), (8, 5), (9, 3), (11, 3), (13, 4), (13, 7)], fill=C("e8504a"))
    bevel(im, 1.4, 0.8)
    put(7, outline(im))

    im, d = new(16, 16)  # check (order badge)
    d.line([(3, 8), (6, 11), (12, 4)], fill=C("8ee06a"), width=2)
    put(8, outline(im))

    im, d = new(16, 16)  # book (codex)
    d.rectangle([3, 3, 12, 13], fill=C("4a8ad0"))
    bevel(im)
    d.rectangle([4, 4, 5, 12], fill=C("2a5a9a"))
    d.rectangle([7, 6, 10, 7], fill=C("ffd84a"))
    put(9, outline(im))

    im, d = new(16, 16)  # flame (production boost)
    d.polygon([(8, 2), (12, 7), (12, 11), (8, 14), (4, 11), (4, 7), (6, 8)], fill=C("ff8a3a"))
    d.polygon([(8, 7), (10, 10), (8, 13), (6, 10)], fill=C("ffe24a"))
    put(10, outline(im))

    im, d = new(16, 16)  # pointing hand (tutorial)
    skin = C("fff0dc")
    d.rectangle([6, 1, 8, 9], fill=skin)      # index finger
    d.rectangle([4, 7, 12, 13], fill=skin)    # palm + curled fingers
    d.rectangle([3, 9, 4, 11], fill=skin)     # thumb
    bevel(im, 1.0, 0.85)
    d.line([(9, 9), (9, 12)], fill=C("e0c0a0"))
    put(11, outline(im))

    for i, on in ((12, True), (13, False)):  # speaker on / off
        im, d = new(16, 16)
        d.rectangle([2, 6, 4, 10], fill=C("f6ecd8"))
        d.polygon([(4, 6), (8, 3), (8, 13), (4, 10)], fill=C("f6ecd8"))
        if on:
            d.arc([7, 4, 13, 12], -60, 60, fill=C("8ee06a"))
        else:
            d.line([(10, 6), (14, 10)], fill=C("ff5a3a"))
            d.line([(14, 6), (10, 10)], fill=C("ff5a3a"))
        put(i, outline(im))

    icons.save(os.path.join(OUT_DIR, "icons.png"))

    # speech bubble 22x22 for floor events (icon is drawn on top in-game)
    im, d = new(22, 22)
    d.rounded_rectangle([1, 1, 20, 16], 4, fill=C("fff8e8"))
    d.polygon([(6, 16), (10, 16), (6, 20)], fill=C("fff8e8"))
    outline(im).save(os.path.join(OUT_DIR, "bubble.png"))

    # weak-point marker 24x24, 2 frames
    sheet, _ = new(48, 24)
    for i, col in enumerate((C("ffe24a"), C("ff5a3a"))):
        im, d = new(24, 24)
        d.ellipse([3, 3, 20, 20], outline=col, width=2)
        d.rectangle([11, 0, 12, 6], fill=col)
        d.rectangle([11, 17, 12, 23], fill=col)
        d.rectangle([0, 11, 6, 12], fill=col)
        d.rectangle([17, 11, 23, 12], fill=col)
        sheet.paste(outline(im), (i * 24, 0))
    sheet.save(os.path.join(OUT_DIR, "weak.png"))

    # broken-part mark 16x16
    im, d = new(16, 16)
    d.line([(3, 3), (12, 12)], fill=C("ff5a3a"), width=2)
    d.line([(12, 3), (3, 12)], fill=C("ff5a3a"), width=2)
    outline(im).save(os.path.join(OUT_DIR, "broken.png"))


# ---------------------------------------------------------------- slime (32x32: idle, idle2, hurt)

def build_slime():
    sheet, _ = new(96, 32)
    for f in range(3):
        im, d = new(32, 32)
        top = 10 if f != 1 else 13
        d.ellipse([4, top, 27, 30], fill=C("ffffff"))
        d.rectangle([4, 24, 27, 30], fill=C("ffffff"))
        d.ellipse([4, 22, 27, 31], fill=C("ffffff"))
        bevel(im, 1.0, 0.78)
        ey = top + 8
        dark = C("2a1a1a")
        if f == 2:
            d.line([(10, ey), (13, ey + 2)], fill=dark)
            d.line([(13, ey), (10, ey + 2)], fill=dark)
            d.line([(19, ey), (22, ey + 2)], fill=dark)
            d.line([(22, ey), (19, ey + 2)], fill=dark)
        else:
            d.rectangle([11, ey, 12, ey + 3], fill=dark)
            d.rectangle([20, ey, 21, ey + 3], fill=dark)
        d.point([(8, top + 4), (9, top + 3)], fill=C("ffffff"))
        sheet.paste(outline(im), (f * 32, 0))
    sheet.save(os.path.join(OUT_DIR, "slime.png"))


# ---------------------------------------------------------------- backgrounds

def build_backgrounds():
    rnd = random.Random(7)

    # forest battle background 400x180
    im, d = new(400, 180, C("8fd3f0"))
    d.rectangle([0, 70, 399, 179], fill=C("a8e0f4"))
    for x in range(-20, 420, 46):  # far trees
        h = rnd.randint(50, 80)
        d.ellipse([x, 120 - h, x + 60, 150], fill=C("5aa86a"))
    for x in range(-30, 430, 64):  # near trees
        h = rnd.randint(70, 100)
        d.rectangle([x + 26, 100, x + 34, 150], fill=C("6e4a34"))
        d.ellipse([x, 128 - h, x + 60, 128], fill=C("3f8a52"))
        d.ellipse([x + 8, 132 - h, x + 40, 110 - h // 2], fill=C("4f9a5e"))
    d.rectangle([0, 146, 399, 179], fill=C("7a5a3c"))
    d.rectangle([0, 142, 399, 150], fill=C("6cc257"))
    d.line([(0, 142), (399, 142)], fill=C("8ee06a"))
    for _ in range(60):
        x, y = rnd.randint(0, 399), rnd.randint(154, 178)
        d.point((x, y), fill=C("6a4a30"))
    for _ in range(40):
        x = rnd.randint(0, 399)
        d.line([(x, 141), (x, 139)], fill=C("5ab04a"))
    im.save(os.path.join(OUT_DIR, "bg_forest.png"))

    # boss lair 400x180
    im, d = new(400, 180, C("2a1e28"))
    for row in range(0, 9):
        y = row * 16
        off = 0 if row % 2 == 0 else 16
        for x in range(-off, 400, 32):
            col = shift(C("4a3238"), rnd.choice((0.85, 0.95, 1.0, 1.08)))
            d.rectangle([x + 1, y + 1, x + 30, y + 14], fill=col)
    d.rectangle([0, 146, 399, 179], fill=C("3a2c34"))
    for x in range(0, 400, 40):
        d.line([(x, 146), (x - 12, 179)], fill=C("2a1e28"))
    d.line([(0, 146), (399, 146)], fill=C("5a4650"))
    d.line([(0, 162), (399, 162)], fill=C("2a1e28"))
    for tx in (70, 330):  # torches
        d.rectangle([tx - 2, 62, tx + 2, 78], fill=C("6e4a34"))
        d.polygon([(tx - 5, 62), (tx, 46), (tx + 5, 62)], fill=C("ff8a3a"))
        d.polygon([(tx - 2, 62), (tx, 53), (tx + 2, 62)], fill=C("ffe24a"))
    d.polygon([(330, 179), (350, 166), (399, 162), (399, 179)], fill=C("ff6a2a"))  # lava
    d.polygon([(352, 179), (366, 171), (399, 168), (399, 179)], fill=C("ffc04a"))
    im.save(os.path.join(OUT_DIR, "bg_lair.png"))

    # tower floor row 232x38 (stone room cross-section)
    im, d = new(232, 38, C("3a3640"))
    for row in range(0, 3):
        y = row * 11
        off = 0 if row % 2 == 0 else 12
        for x in range(-off, 232, 24):
            col = shift(C("4a4652"), rnd.choice((0.9, 1.0, 1.08)))
            d.rectangle([x + 1, y + 1, x + 22, y + 9], fill=col)
    d.rectangle([0, 33, 231, 37], fill=C("7a7684"))
    d.line([(0, 33), (231, 33)], fill=C("9a96a6"))
    d.line([(0, 37), (231, 37)], fill=C("2a2630"))
    im.save(os.path.join(OUT_DIR, "row_bg.png"))


if __name__ == "__main__":
    build_items()
    build_ui()
    build_slime()
    build_backgrounds()
    print("placeholder art written to", OUT_DIR)
