#!/usr/bin/env python3
"""WebKit 回归：杜邦分析动画。减弱动态效果下停在第一步、点播放能推进；
正常模式下连播能走到最后一步，滑块能改 ROE。"""
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
APP = f"{(ROOT / 'dist' / 'index.html').as_uri()}#/dupont"
ON = "document.querySelector('.fo-steps button[aria-selected=true]')?.innerText.startsWith(%r)"


def run():
    subprocess.run(["npm", "run", "build"], cwd=ROOT, check=True)
    with sync_playwright() as p:
        browser = p.webkit.launch()
        errors = []

        # 减弱动态效果：只关自动播放，手动点播放仍要真的演
        page = browser.new_context(reduced_motion="reduce").new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(APP)
        page.wait_for_selector(".fo-stage")
        page.wait_for_timeout(2000)
        assert page.evaluate(ON % "1")
        page.locator('button[aria-label="播放"]').click()
        page.wait_for_function(ON % "2", timeout=8000)

        # 正常模式：连播走到第 7 步，走过的步常亮，滑块改数字
        page = browser.new_context().new_page()
        page.on("pageerror", lambda e: errors.append(str(e)))
        page.goto(APP)
        page.wait_for_selector(".fo-stage")
        page.wait_for_function(ON % "7", timeout=45000)
        vis = page.evaluate("[...document.querySelectorAll('.dp-p.done')].every(e => getComputedStyle(e).visibility === 'visible' && getComputedStyle(e).opacity === '1')")
        assert vis, "走过的步没有常亮"
        assert "ROE 20%" in page.locator(".dp-eq").text_content()
        page.locator(".dp-ctl input").nth(0).fill("3")
        assert "ROE 30%" in page.locator(".dp-eq").text_content()

        # 追问默认收起、点开有答案；「去题库练」要落到含杜邦/权益乘数的真题
        ask = page.locator(".fo-caption .dp-ask")
        assert not ask.evaluate("e => e.open")
        ask.locator("summary").click()
        assert "1.5" in ask.locator("p").text_content()
        page.get_by_text("去题库练").click()
        page.wait_for_function("location.hash.includes('practice')")
        page.wait_for_selector("text=/杜邦|权益乘数/", timeout=5000)

        assert not errors, f"WebKit 页面报错：{errors}"
        browser.close()
    print("WebKit 杜邦分析动画回归通过")


if __name__ == "__main__":
    sys.exit(run())
