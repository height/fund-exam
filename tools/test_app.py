#!/usr/bin/env python3
"""端到端自检：先 npm run build，再真跑一遍要部署的 dist/index.html。

只驱动界面，不碰内部变量，所以重构不会把测试一起带塌。
用法: python3 tools/test_app.py（需要 playwright + 本机 Chrome）
"""
import subprocess
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
APP = (ROOT / "dist" / "index.html").as_uri()


def run():
    subprocess.run(["npm", "run", "build"], cwd=ROOT, check=True)

    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")  # 用系统已装的 Chrome，省一次 playwright install
        pg = b.new_page(viewport={"width": 390, "height": 844})
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(APP)

        # 首页：题库加载出来了
        pg.wait_for_selector("text=基金从业刷题")
        assert pg.locator("nav button", has_text="首页").count() == 1
        chip = pg.locator(".chip").first.inner_text()
        assert int(chip.split()[0]) > 800, f"题库只有 {chip}"

        # 练习：选一个选项 -> 立刻出解析，正确答案标绿
        pg.click('nav button:has-text("练习")')
        pg.click('button:has-text("开始练习")')
        pg.wait_for_selector(".stem")
        pg.click('[data-pick="0"]')
        pg.wait_for_selector(".explain")
        assert pg.locator(".opt.ok").count() == 1, "没有标出正确答案"
        assert pg.locator(".opt[disabled]").count() == 4, "揭晓后选项还能点"

        # 翻页：下一题换题干
        stem = pg.locator(".stem").inner_text()
        pg.click('button:has-text("下一题")')
        pg.wait_for_function(
            "s=>document.querySelector('.stem').innerText!==s", arg=stem)

        # 模拟考：开考 -> 直接交卷（全不答）-> 出成绩，错题全进错题本
        pg.click('nav button:has-text("模拟考")')
        pg.click('button:has-text("开始考试")')
        pg.wait_for_selector(".timer")
        assert pg.locator(".sheet").count() == 0
        pg.click('button:has-text("答题卡")')
        pg.wait_for_selector(".overlay .sheet button")
        assert pg.locator(".overlay .sheet button").count() == 100, "没抽满 100 题"
        pg.once("dialog", lambda d: d.accept())
        pg.click('.overlay button:has-text("交卷")')
        pg.wait_for_selector("text=模拟考成绩")
        assert pg.locator("text=差 60 分及格").count() == 1, "全不答应该是 0 分"

        pg.click('button:has-text("去刷错题")')
        pg.wait_for_selector("text=道待消灭")
        n = int(pg.locator(".card .num").first.inner_text())
        assert n > 0, "交卷后错题本还是空的"

        # 错题重练：跳过选范围，直接进答题
        pg.click('button:has-text("错题重练")')
        pg.wait_for_selector(".stem")
        assert pg.locator('button:has-text("退出")').count() == 1
        pg.click('button:has-text("退出")')
        pg.wait_for_selector("text=练什么")

        # 数据页：存量统计对得上
        pg.click('nav button:has-text("数据")')
        # 考试记录是异步从 IndexedDB 读的，用 wait 而不是立刻断言
        pg.wait_for_selector('.list-item:has-text("考试记录") b:text-is("1")')

        # 刷新后进度还在（IndexedDB 落盘了）
        pg.reload()
        pg.wait_for_selector("text=基金从业刷题")
        pg.click('nav button:has-text("错题本")')
        pg.wait_for_selector("text=道待消灭")
        assert int(pg.locator(".card .num").first.inner_text()) == n, "刷新后错题本对不上"

        assert not errs, f"控制台报错：{errs}"
        b.close()
    print("端到端自检通过")


if __name__ == "__main__":
    sys.exit(run())
