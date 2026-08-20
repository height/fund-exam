#!/usr/bin/env python3
"""生成 public/ 下的主屏图标。颜色跟 src/styles.css 的 --accent 保持一致。

改了配色就重跑一次，否则装到主屏上的还是上一版的颜色。
用法: python3 tools/make_icons.py（需要 pillow）
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parents[1] / "public"
BG, FG = "#2563EB", "#FFFFFF"   # --accent / 白字


def pick_font(px):
    """PIL 打不开 PingFang.ttc，挑第一个能开的黑体"""
    for p in ("/System/Library/Fonts/STHeiti Medium.ttc",
              "/System/Library/Fonts/Hiragino Sans GB.ttc"):
        try:
            return ImageFont.truetype(p, px)
        except OSError:
            pass


def main():
    for size in (180, 512):
        img = Image.new("RGB", (size, size), BG)
        d = ImageDraw.Draw(img)
        font = pick_font(int(size * 0.62))
        if font:
            d.text((size / 2, size * 0.52), "基", font=font, fill=FG, anchor="mm")
        else:   # 字体都开不了就画个色块，至少不是空白
            d.rounded_rectangle([size * .22, size * .22, size * .78, size * .78], size * .12, fill=FG)
        img.save(OUT / f"icon-{size}.png")
        print(f"public/icon-{size}.png")


if __name__ == "__main__":
    main()
