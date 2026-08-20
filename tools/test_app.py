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
        pg.wait_for_selector(".appbar .seg button.on")
        assert pg.locator("nav button", has_text="首页").count() == 1
        # 题库规模和更新时间都落在页脚
        colophon = pg.locator(".colophon").inner_text()
        assert "应用更新" in colophon and "题库更新" in colophon, colophon
        n = int(colophon.split("共")[1].split("题")[0].strip())
        assert n > 800, f"题库只有 {n} 题"
        # 首页只有一个主行动
        assert pg.locator(".go").count() == 1
        # 今日/累计：没做过题时都是 0
        assert pg.locator(".today").inner_text().replace("\n", " ").startswith("今日练习0题")

        # 知识图谱：首页进入，展开一章 -> 点要点出详情 -> 「练这章」跳进练习
        pg.click('button:has-text("知识图谱")')
        pg.wait_for_selector('svg[role="tree"]')
        assert pg.locator(".map-node.d1").count() >= 8, "章节节点少于 8 个"
        assert pg.locator(".map-node.d2").count() == 0, "初始就该只展开到章节层"
        pg.click(".map-node.d1 >> nth=0")
        pg.wait_for_selector(".map-node.d2")
        pg.click(".map-node.d2 >> nth=0")
        pg.wait_for_selector(".map-node.leaf")
        pg.click(".map-node.leaf >> nth=0")
        pg.wait_for_selector(".map-detail")
        assert pg.locator(".map-detail p").inner_text(), "要点详情是空的"
        pg.click('.map-detail button:has-text("去练")')
        pg.wait_for_selector(".stem")
        pg.click('button:has-text("退出")')
        pg.click('nav button:has-text("首页")')
        pg.wait_for_selector(".hero-verdict")

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

        # AI 解析：只在答错时出现，没 Key 先就地要一个（不发真实请求）
        for _ in range(6):  # 连做几题，总会错一道
            pg.click('[data-pick="0"]')
            pg.wait_for_selector(".explain")
            if pg.locator(".opt.bad").count():
                break
            pg.click('button:has-text("下一题")')
        assert pg.locator(".ai-ask").count() == 1, "答错了却没有 AI 入口"
        pg.click(".ai-ask")
        pg.wait_for_selector(".ai-key input")
        assert "分开" in pg.locator(".ai-key .muted").inner_text(), "没有说明 Key 的隔离存放"

        # 假流式响应：SSE 解析和 Markdown 渲染都过一遍，不发真实请求
        sse = (
            'data: {"choices":[{"delta":{"content":"考点：**不可分性**\\n**一句话**：拆不开\\n---\\n"}}]}\n\n'
            'data: {"choices":[{"delta":{"content":"1. 金额大\\n2. 拆不开"}}]}\n\n'
            "data: [DONE]\n\n"
        )
        pg.route("**/chat/completions", lambda r: r.fulfill(
            status=200, content_type="text/event-stream", body=sse))
        pg.fill(".ai-key input", "sk-test")
        pg.click('button:has-text("开讲")')
        pg.wait_for_selector(".ai-text b")
        md = pg.locator(".ai-text").inner_text()
        assert "*" not in md, "Markdown 粗体没渲染成 <b>（整行加粗开头是重灾区）"
        assert "---" not in md, "分隔线不该进正文"
        assert pg.locator(".ai-text ol li").count() == 2, "编号列表没渲染"

        # 模拟考：开考 -> 直接交卷（全不答）-> 出成绩，错题全进错题本
        pg.click('nav button:has-text("模拟考")')
        pg.click('button:has-text("开始考试")')
        pg.wait_for_selector(".timer")
        assert pg.locator(".sheet").count() == 0
        pg.click('button:has-text("答题卡")')
        pg.wait_for_selector(".overlay .sheet button")
        assert pg.locator(".overlay .sheet button").count() == 100, "没抽满 100 题"
        # 交卷确认走应用内弹层，不该再触发系统弹窗
        pg.on("dialog", lambda d: errs.append(f"冒出了原生弹窗：{d.message}"))
        pg.click('.overlay button:has-text("交卷")')
        pg.wait_for_selector('.overlay.center[role="dialog"]')
        assert pg.locator("text=还有 100 题没作答").count() == 1
        pg.click('.overlay.center button:has-text("确定交卷")')
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
        assert pg.locator('button:has-text("章节顺序")').count() == 1

        # 设置页：存量统计对得上
        pg.click('nav button:has-text("设置")')
        # 考试记录是异步从 IndexedDB 读的，用 wait 而不是立刻断言
        pg.wait_for_selector('.list-item:has-text("考试记录") b:text-is("1")')

        # AI 配置：切预设自动带出地址和模型名
        pg.click('.seg button:has-text("智谱 GLM")')
        assert pg.locator(".ai-field input").nth(1).input_value() == "glm-5.3"
        assert "bigmodel.cn" in pg.locator(".ai-field input").nth(0).input_value()
        pg.click('.seg button:has-text("DeepSeek")')
        assert pg.locator(".ai-field input").nth(1).input_value() == "deepseek-v4-pro"

        # 保存前先试调用：通了才落盘（沿用上面注册的假接口），401 则保存失败
        pg.click('button:has-text("保存并测试")')
        pg.wait_for_selector('.toast:has-text("已保存")')
        pg.unroute("**/chat/completions")
        pg.route("**/chat/completions", lambda r: r.fulfill(status=401, body="{}"))
        pg.click('button:has-text("保存并测试")')
        pg.wait_for_selector('.toast:has-text("保存失败：Key 无效")')

        # tab 即默认模型：切到 GLM 后刷新，还停在 GLM；DeepSeek 那份配置也没丢
        pg.click('.seg button:has-text("智谱 GLM")')
        pg.reload()
        pg.wait_for_selector(".appbar .seg button.on")
        pg.click('nav button:has-text("设置")')
        assert pg.locator('.card:has-text("AI 解析") .seg button.on').inner_text() == "智谱 GLM"
        pg.click('.seg button:has-text("DeepSeek")')
        assert pg.locator(".ai-field input").nth(2).input_value() == "sk-test", "DeepSeek 的 Key 没记住"

        # 清空进度：危险操作要二次确认，点外面等于取消
        pg.click('button:has-text("清空全部进度")')
        pg.wait_for_selector("text=清空全部进度？")
        pg.mouse.click(195, 60)  # 点弹层外的遮罩
        pg.wait_for_selector('.overlay.center', state="detached")
        pg.wait_for_selector('.list-item:has-text("考试记录") b:text-is("1")')

        # 跳过导航链接：第一个 Tab 就能拿到
        pg.keyboard.press("Tab")
        assert pg.evaluate("document.activeElement.className") == "skip"

        # 刷新后进度还在（IndexedDB 落盘了）
        pg.reload()
        pg.wait_for_selector(".appbar .seg button.on")
        pg.click('nav button:has-text("错题本")')
        pg.wait_for_selector("text=道待消灭")
        assert int(pg.locator(".card .num").first.inner_text()) == n, "刷新后错题本对不上"

        assert not errs, f"控制台报错：{errs}"
        b.close()
    print("端到端自检通过")


if __name__ == "__main__":
    sys.exit(run())
