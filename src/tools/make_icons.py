"""Draw the original app icons (raft with a sail on a turquoise sea). Requires Pillow.

Run from the repository root: python3 src/tools/make_icons.py
"""
from pathlib import Path
from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parents[2] / 'assets'


def draw(size, maskable=False):
    s = 1024
    im = Image.new('RGBA', (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # 배경: 하늘에서 청록 바다로 (maskable은 전체를 채움, 일반은 둥근 사각형)
    bg = Image.new('RGBA', (s, s))
    bd = ImageDraw.Draw(bg)
    for y in range(s):
        t = y / s
        if t < 0.55:
            c = (int(120 + 60 * t), int(212 + 20 * t), int(240 - 10 * t), 255)
        else:
            k = (t - 0.55) / 0.45
            c = (int(40 - 20 * k), int(200 - 60 * k), int(205 - 40 * k), 255)
        bd.line([(0, y), (s, y)], fill=c)
    mask = Image.new('L', (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s, s], radius=0 if maskable else 220, fill=255)
    im.paste(bg, (0, 0), mask)
    d = ImageDraw.Draw(im)
    pad = 120 if maskable else 0  # maskable 아이콘은 가운데 안전 영역 안에 그림
    sc = (s - 2 * pad) / s

    def P(x, y):
        return (pad + x * sc, pad + y * sc)

    # 해
    cx, cy = P(760, 250)
    r = 95 * sc
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 226, 120, 255))
    # 물결
    for i, y in enumerate((640, 720, 800)):
        x0, y0 = P(150, y)
        x1, y1 = P(874, y + 30)
        d.arc([x0, y0, x1, y1], 200, 340, fill=(220, 250, 248, 200), width=int(14 * sc))
    # 뗏목 (판자 5장 + 가로대)
    for i in range(5):
        x = 270 + i * 100
        a, b = P(x, 600), P(x + 88, 700)
        d.rounded_rectangle([a, b], radius=int(18 * sc), fill=(196, 136, 78, 255), outline=(120, 76, 40, 255), width=int(8 * sc))
    a, b = P(250, 625), P(790, 655)
    d.rounded_rectangle([a, b], radius=int(10 * sc), fill=(140, 92, 50, 255))
    # 돛대와 돛
    a, b = P(505, 250), P(535, 610)
    d.rectangle([a, b], fill=(110, 70, 38, 255))
    d.polygon([P(545, 270), P(545, 560), P(760, 540)], fill=(250, 244, 226, 255), outline=(200, 186, 150, 255))
    d.polygon([P(495, 300), P(495, 540), P(320, 525)], fill=(255, 250, 238, 255), outline=(200, 186, 150, 255))
    # 작은 청록 깃발
    d.polygon([P(535, 230), P(535, 280), P(620, 255)], fill=(47, 183, 176, 255))
    out = im.resize((size, size), Image.LANCZOS)
    return out


ASSETS.mkdir(exist_ok=True)
for name, size, maskable in [('icon-192.png', 192, False), ('icon-512.png', 512, False),
                             ('icon-maskable-512.png', 512, True), ('apple-touch-icon.png', 180, True)]:
    draw(size, maskable).save(ASSETS / name)
    print('saved', name)
