#!/usr/bin/env python3
"""WebKit 回归：开启「减弱动态效果」后，手动播放仍须运行基金运作动画。"""
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
APP = f"{(ROOT / 'dist' / 'index.html').as_uri()}#/fundops"


def run():
    subprocess.run(["npm", "run", "build"], cwd=ROOT, check=True)
    with sync_playwright() as p:
        browser = p.webkit.launch()
        context = browser.new_context(
            viewport={"width": 390, "height": 844},
            is_mobile=True,
            has_touch=True,
            reduced_motion="reduce",
        )
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(APP)
        page.wait_for_selector(".fo-stage")

        # 减弱动态效果只关闭自动播放，进入页面后应停在第一步。
        page.wait_for_timeout(3200)
        assert page.locator('.fo-steps button[aria-selected="true"]').inner_text().startswith("1")
        assert page.locator('button[aria-label="播放"]').is_visible()

        # 用户明确点击后，应真正播放并自动进入第二步，而不是继续停在终态。
        page.locator('button[aria-label="播放"]').click()
        page.wait_for_function(
            "document.querySelector('.fo-steps button[aria-selected=true]')?.innerText.startsWith('2')",
            timeout=6000,
        )
        assert not errors, f"WebKit 页面报错：{errors}"
        browser.close()

    print("WebKit 基金运作动画回归通过")


if __name__ == "__main__":
    sys.exit(run())
