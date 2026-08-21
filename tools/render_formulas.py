#!/usr/bin/env python3
"""把《证券投资基金公式汇总》PDF 渲染成 public/formulas/ 下的图片。

那份 PDF 是扫描件，pypdf 一个字也抽不出来，所以公式图谱只能走图片。

图片放 public/ 而不是 import 进 JS：构建产物是单文件 PWA，凡是被 JS 引用的资源
都会 base64 内联进 index.html。18 页约 1.7MB，内联会把 1.2MB 的首屏撑到 4MB+，
首次打开要多等好几秒。放 public/ 则原样拷进 dist，按需加载，sw 看过一次再缓存。

110dpi + JPEG q72 是试出来的平衡点：表格线和下标都清晰，单页约 100KB。

用法: python3 tools/render_formulas.py（需要 poppler 的 pdftoppm）
"""
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "materials/02_科目二_证券投资基金基础/02_专题总结/公式与计算/2026年《证券投资基金》公式汇总.pdf"
OUT = ROOT / "public" / "formulas"
DPI, QUALITY = 110, 72


def main():
    if not SRC.exists():
        raise SystemExit(f"找不到素材：{SRC}\n素材不入 git，见 docs/资料索引.md")
    if not shutil.which("pdftoppm"):
        raise SystemExit("需要 pdftoppm：brew install poppler")

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)

    subprocess.run(
        ["pdftoppm", "-jpeg", "-r", str(DPI), "-jpegopt", f"quality={QUALITY}", str(SRC), str(OUT / "f")],
        check=True,
    )

    pages = sorted(p.name for p in OUT.glob("f-*.jpg"))
    (ROOT / "src" / "data" / "formulas.json").write_text(
        json.dumps({"pages": pages}, ensure_ascii=False), encoding="utf-8")

    total = sum((OUT / p).stat().st_size for p in pages)
    print(f"{len(pages)} 页 -> public/formulas/  共 {total / 1024:.0f} KB"
          f"（单页均 {total / len(pages) / 1024:.0f} KB）")
    assert pages, "一页都没渲染出来"


if __name__ == "__main__":
    main()
