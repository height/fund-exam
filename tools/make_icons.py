#!/usr/bin/env python3
"""从 1024px 主图生成浏览器、Apple Touch 和 PWA 图标。

用法: python3 tools/make_icons.py（需要 pillow）
"""
from pathlib import Path

from PIL import Image

OUT = Path(__file__).resolve().parents[1] / "public"
SOURCE = OUT / "kaojibao-app-icon.png"


def main():
    source = Image.open(SOURCE).convert("RGB")
    outputs = {
        "favicon-32.png": 32,
        "icon-180.png": 180,
        "icon-192.png": 192,
        "icon-512.png": 512,
        "icon-1024.png": 1024,
        "icon-maskable-192.png": 192,
        "icon-maskable-512.png": 512,
    }
    for filename, size in outputs.items():
        source.resize((size, size), Image.Resampling.LANCZOS).save(OUT / filename)
        print(f"public/{filename}")


if __name__ == "__main__":
    main()
