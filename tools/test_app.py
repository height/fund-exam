#!/usr/bin/env python3
"""端到端自检：先 npm run build，再真跑一遍要部署的 dist/index.html。

只驱动界面，不碰内部变量，所以重构不会把测试一起带塌。
用法: python3 tools/test_app.py（需要 playwright + 本机 Chrome）
"""
import base64
import json
import re
import struct
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
        # 缩放全禁：双击、双指、以及 iOS 聚焦输入框时的自动放大
        assert "user-scalable=no" in pg.eval_on_selector("meta[name=viewport]", "e=>e.content")
        assert pg.eval_on_selector("html", "e=>getComputedStyle(e).touchAction") == "manipulation"
        assert pg.evaluate("()=>{const e=new Event('gesturestart',{cancelable:true});"
                           "document.dispatchEvent(e);return e.defaultPrevented}"), "iOS 双指缩放没拦住"

        # 首页两个刷题入口并排：章节练习 + 随机
        assert pg.locator(".go").count() == 2
        assert pg.locator(".go-seq").inner_text().startswith("章节练习")
        assert "随机" in pg.locator(".go-rand").inner_text()
        # 今日/累计：没做过题时都是 0
        assert pg.locator(".today").inner_text().replace("\n", " ").startswith("今日练习0题")

        # 章节练习：官方教材 8 章全有题，点进去抽的确实是本章的题
        pg.click(".go-seq")
        pg.wait_for_selector(".ch-row")
        assert pg.locator(".ch-row").count() == 8, "科目一应是官方目录的 8 章"
        assert pg.locator(".ch-row:disabled").count() == 0, "有章一题都没有，归类漏了"
        first = pg.locator(".ch-row").first.inner_text()
        pg.locator(".ch-row").first.click()
        pg.wait_for_selector(".stem")
        # 章节页写的题数要跟练习里抽到的总题数对得上
        n_listed = int(re.search(r"(\d+) 题", first).group(1))
        assert pg.locator(".topbar").first.inner_text().strip().endswith(f"/{n_listed}"), \
            f"章节题数对不上：列表说 {n_listed}"
        pg.go_back()
        # 考试模式：同一章抽最多 30 题限时考
        pg.wait_for_selector(".ch-row")
        pg.click('[role="tab"]:has-text("考试")')
        pg.locator(".ch-row").first.click()
        pg.wait_for_selector(".stats")
        assert "章节考试" in pg.locator("h1").first.inner_text()
        pg.goto(APP)
        pg.wait_for_selector(".tile")

        # 公式攻坚：计算题清单 + 计算器 + 公式图谱
        pg.click('.tile:has-text("公式攻坚")')
        pg.wait_for_selector(".calc-fab")
        assert int(pg.locator(".hero-num").inner_text()) > 20, "计算题没筛出来"
        # 计算器：复利 10000×(1+3%)² = 10609，验的是自己写的求值器不是 eval
        pg.click(".calc-fab")
        pg.wait_for_selector(".calc-drawer")
        for k in ["1", "0", "0", "0", "0", "×", "(", "1", "+", "3", "%", ")", "x²"]:
            pg.click(f'.calc-pad button:text-is("{k}")')
        assert pg.locator(".calc-ans").inner_text().strip() == "= 10609", "边打边算的结果不对"
        pg.click('.calc-pad button:text-is("=")')
        assert pg.locator(".calc-expr").inner_text().strip() == "10609"
        pg.keyboard.press("Escape")
        pg.wait_for_selector(".calc-drawer", state="detached")
        # 公式图谱：图片没内联进 bundle，是 public/ 下的独立文件
        pg.click('.appbar button:has-text("公式图谱")')
        pg.wait_for_selector(".fx-page img")
        assert pg.locator(".fx-page").count() >= 15, "公式页数不对"
        src = pg.eval_on_selector(".fx-page img", "e=>e.getAttribute('src')")
        assert src.startswith("./formulas/"), f"公式图被内联了：{src[:40]}"
        # 全局缩放已禁，全屏看图得自带放大档
        pg.click(".fx-page >> nth=0")
        pg.wait_for_selector(".fx-full img")
        fit = pg.eval_on_selector(".fx-stage img", "e=>e.getBoundingClientRect().width")
        pg.click('.fx-bar button:has-text("放大")')
        big = pg.eval_on_selector(".fx-stage img", "e=>e.getBoundingClientRect().width")
        assert big > fit * 1.5, f"放大档没生效 {fit} -> {big}"
        pg.keyboard.press("Escape")
        pg.wait_for_selector(".fx-full", state="detached")
        pg.click('.appbar button[aria-label="返回首页"]')
        pg.wait_for_selector(".hero-verdict")

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
        # 答题中收起底栏，只留「退出」一个出口，且退出要确认
        assert pg.locator("nav").count() == 0, "答题中不该还挂着底栏"
        pg.click('button[aria-label="退出练习"]')
        pg.wait_for_selector(".overlay.center")
        pg.click('.overlay.center button:has-text("继续练习")')
        pg.wait_for_selector(".overlay.center", state="detached")
        assert pg.locator(".stem").count() == 1, "点了取消不该退出去"
        pg.click('button[aria-label="退出练习"]')
        pg.wait_for_selector(".overlay.center")
        pg.click('.overlay.center button:has-text("退出")')
        pg.wait_for_selector(".overlay.center", state="detached")
        # setQuiz(false) 在 effect 里跑，比「练什么」晚一帧，等底栏自己回来
        pg.wait_for_selector("text=练什么")
        pg.wait_for_selector("nav")
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
        assert pg.locator(".explain-tabs").count() == 1, "答对答错都该有 AI 解析 tab"

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
        assert pg.locator(".explain-tabs").count() == 1, "答错了却没有 AI 解析 tab"
        pg.click('.explain-tabs button:has-text("AI 解析")')
        pg.wait_for_selector(".ai-key input")
        assert "分开" in pg.locator(".ai-key .muted").inner_text(), "没有说明 Key 的隔离存放"

        # 假流式响应：SSE 解析和 Markdown 渲染都过一遍，不发真实请求
        wide = "对比项" + "很长的内容" * 30
        sse = (
            'data: {"choices":[{"delta":{"content":"考点：**不可分性**\\n**一句话**：拆不开\\n---\\n"}}]}\n\n'
            'data: {"choices":[{"delta":{"content":"1. 金额大\\n2. 拆不开\\n'
            f'|项目|{wide}|\\n|---|---|\\n|甲|乙|"}}}}]}}\n\n'
            "data: [DONE]\n\n"
        )
        ai_hits = []
        pg.route("**/chat/completions", lambda r: (ai_hits.append(1), r.fulfill(
            status=200, content_type="text/event-stream", body=sse))[-1])
        pg.fill(".ai-key input", "sk-test")
        pg.click('button:has-text("开讲")')
        pg.wait_for_selector(".ai-text b")
        md = pg.locator(".ai-text").inner_text()
        assert "*" not in md, "Markdown 粗体没渲染成 <b>（整行加粗开头是重灾区）"
        assert "---" not in md, "分隔线不该进正文"
        assert pg.locator(".ai-text ol li").count() == 2, "编号列表没渲染"
        assert pg.locator(".md-table td").count() == 2, "表格没渲染"

        # 图解 tab：出沙箱 iframe；三档 tab 来回切不重发请求
        h0 = len(ai_hits)
        pg.click('.explain-tabs button:has-text("图解")')
        pg.wait_for_selector('iframe.demo-frame')
        assert pg.locator("iframe.demo-frame").get_attribute("sandbox") == "allow-scripts", "iframe 没关沙箱"
        pg.click('.demo-box button[aria-label="全屏查看"]')
        pg.wait_for_selector(".demo-full")
        pg.keyboard.press("Escape")
        pg.wait_for_selector(".demo-full", state="detached")
        pg.click('.explain-tabs button:text-is("解析")')
        pg.click('.explain-tabs button:has-text("AI 解析")')
        pg.click('.explain-tabs button:has-text("图解")')
        pg.wait_for_selector('iframe.demo-frame')
        assert len(ai_hits) == h0 + 1, f"切 tab 不该重发请求，多了 {len(ai_hits) - h0 - 1} 次"
        pg.click('.explain-tabs button:has-text("AI 解析")')

        # AI 文字解析同样能全屏
        pg.click('.ai-box button[aria-label="全屏查看"]')
        pg.wait_for_selector(".ai-full .ai-text b")
        pg.keyboard.press("Escape")
        pg.wait_for_selector(".ai-full", state="detached")

        # 重新解析：真发一次新请求；换题再回来走内存缓存，不再请求
        n0 = len(ai_hits)
        pg.click('button:has-text("重新解析")')
        pg.wait_for_selector('button:has-text("重新解析")')
        assert len(ai_hits) == n0 + 1, "重新解析没有发新请求"
        pg.click('button:has-text("下一题")')
        pg.wait_for_selector(".stem")
        pg.click('button:has-text("上一题")')
        pg.click('.explain-tabs button:has-text("AI 解析")')
        pg.wait_for_selector(".ai-text b")
        assert len(ai_hits) == n0 + 1, "缓存没生效，回到旧题又发请求了"

        # 划词解释：选中题干两个字 -> 浮出按钮 -> 气泡；气泡里再选词叠一层，关掉回一层
        select = """sel => {
            const el = document.querySelector(sel)
            const r = document.createRange()
            r.setStart(el.firstChild, 0); r.setEnd(el.firstChild, 2)
            const s = getSelection(); s.removeAllRanges(); s.addRange(r)
        }"""
        pg.evaluate(select, ".stem")
        pg.wait_for_selector(".sel-tip")
        pg.click(".sel-tip")
        pg.wait_for_selector(".bubble .ai-text b")  # 假接口的 markdown 渲染出来了
        pg.evaluate(select, ".bubble-body p")
        pg.wait_for_selector(".sel-tip")
        pg.click(".sel-tip")
        pg.wait_for_function("document.querySelectorAll('.bubble').length === 2")
        pg.locator('.bubble button[aria-label="关闭"]').last.click()
        pg.wait_for_function("document.querySelectorAll('.bubble').length === 1")
        pg.locator('.bubble button[aria-label="关闭"]').click()

        # 朗读：假 TTS 接口回一段静音 WAV，题目和 AI 解析的喇叭都能出声
        wav = (b"RIFF" + struct.pack("<I", 36 + 320) + b"WAVEfmt "
               + struct.pack("<IHHIIHH", 16, 1, 1, 8000, 16000, 2, 16)
               + b"data" + struct.pack("<I", 320) + b"\x00" * 320)
        tts_body = json.dumps({"choices": [{"message": {"audio": {
            "data": base64.b64encode(wav).decode()}}}]})
        tts_hits = []
        pg.route("**/api.xiaomimimo.com/**", lambda r: (tts_hits.append(1), r.fulfill(
            status=200, content_type="application/json", body=tts_body))[-1])
        pg.evaluate("""() => {
            const s = JSON.parse(localStorage.getItem('ai-config'))
            s.ttsKey = 'tts-test'
            localStorage.setItem('ai-config', JSON.stringify(s))
        }""")
        pg.click('button[aria-label="朗读题目"]')
        pg.wait_for_timeout(400)
        pg.click('button[aria-label="朗读解析"]')
        pg.wait_for_timeout(400)
        assert len(tts_hits) == 2, f"TTS 该被调用两次，实际 {len(tts_hits)}"
        assert "语音" not in (pg.locator(".toast").inner_text() or ""), "朗读报错了"
        # 同一段话重播直接用缓存，不该再花钱合成。
        # 认 .spk 而不是 aria-label：假 WAV 只有 0.02 秒，播完按钮就从
        # 「停止朗读」变回「朗读题目」了，按标签点会看状态脸色
        pg.locator(".spk").first.click()
        pg.wait_for_timeout(400)
        pg.locator(".spk").first.click()
        pg.wait_for_timeout(400)
        assert len(tts_hits) == 2, f"重播又请求了接口，实际调用 {len(tts_hits)} 次"

        # 练习完先退出，底栏才回来
        pg.click('button[aria-label="退出练习"]')
        pg.wait_for_selector(".overlay.center")
        pg.click('.overlay.center button:has-text("退出")')
        pg.wait_for_selector(".overlay.center", state="detached")
        pg.wait_for_selector("text=练什么")

        # 模拟考：开考 -> 直接交卷（全不答）-> 出成绩，错题全进错题本
        pg.click('nav button:has-text("模拟考")')
        pg.click('button:has-text("开始考试")')
        pg.wait_for_selector(".timer")
        assert pg.locator("nav").count() == 0, "考试中不该还挂着底栏"
        assert pg.locator('.topbar button[aria-label="退出考试"]').count() == 1, "考试中没有退出口"
        pg.click('.topbar button[aria-label="退出考试"]')
        pg.wait_for_selector(".overlay.center")
        pg.click('.overlay.center button:has-text("离开")')
        pg.wait_for_selector("nav")            # 只确认一次，不该再弹第二道
        pg.click('nav button:has-text("模拟考")')
        pg.wait_for_selector("text=有一场没考完")
        pg.click('button:has-text("继续考试")')
        pg.wait_for_selector(".timer")
        assert pg.locator(".sheet").count() == 0
        pg.click('button[aria-label="答题卡"]')
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
        assert pg.locator('button[aria-label="退出练习"]').count() == 1
        pg.click('button[aria-label="退出练习"]')
        pg.wait_for_selector(".overlay.center")
        pg.click('.overlay.center button:has-text("退出")')
        pg.wait_for_selector(".overlay.center", state="detached")
        pg.wait_for_selector("text=练什么")
        assert pg.locator('button:has-text("章节顺序")').count() == 1

        # 设置页：存量统计对得上
        pg.click('nav button:has-text("设置")')
        # 考试记录是异步从 IndexedDB 读的，用 wait 而不是立刻断言
        pg.wait_for_selector('.list-item:has-text("考试记录") b:text-is("1")')
        small = pg.eval_on_selector_all(
            "input", "es=>es.filter(e=>!e.hidden&&getComputedStyle(e).display!=='none')"
                     ".map(e=>parseFloat(getComputedStyle(e).fontSize)).filter(s=>s<16)")
        assert not small, f"输入框字号 {small} 小于 16px，iOS 聚焦时会自动放大页面"

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
        # 顺带验证 hash 路由：刷新后还在设置页，不用重新点导航
        pg.click('.seg button:has-text("智谱 GLM")')
        pg.reload()
        pg.wait_for_selector('h1:has-text("设置")')
        on = pg.locator('.card:has(h2:text-is("AI 解析")) .seg button.on').inner_text()
        assert "智谱 GLM" in on and "默认" in on, f"默认标记不见了：{on}"
        pg.click('.seg button:has-text("DeepSeek")')
        assert pg.locator(".ai-field input").nth(2).input_value() == "sk-test", "DeepSeek 的 Key 没记住"

        # 朗读语速：改了要存住，刷新后还在
        tts = pg.locator('.card:has(h2:text-is("语音朗读")) .seg-n')
        assert tts.locator("button.on").inner_text() == "1×", "语速默认档不对"
        tts.locator('button:text-is("1.5×")').click()
        pg.reload()
        pg.wait_for_selector('h1:has-text("设置")')
        tts = pg.locator('.card:has(h2:text-is("语音朗读")) .seg-n')
        assert tts.locator("button.on").inner_text() == "1.5×", "语速没存住"
        assert pg.evaluate("()=>JSON.parse(localStorage.getItem('ai-config')).ttsSpeed") == 1.5

        # 清空进度：危险操作要二次确认，点外面等于取消
        pg.click('button:has-text("清空全部进度")')
        pg.wait_for_selector("text=清空全部进度？")
        pg.mouse.click(195, 60)  # 点弹层外的遮罩
        pg.wait_for_selector('.overlay.center', state="detached")
        pg.wait_for_selector('.list-item:has-text("考试记录") b:text-is("1")')

        # 跳过导航链接：第一个 Tab 就能拿到
        pg.keyboard.press("Tab")
        assert pg.evaluate("document.activeElement.className") == "skip"

        # 刷新后进度还在（IndexedDB 落盘了）；hash 路由让刷新停在原页，这里在设置页
        pg.reload()
        pg.wait_for_selector('h1:has-text("设置")')
        pg.click('nav button:has-text("错题本")')
        pg.wait_for_selector("text=道待消灭")
        assert int(pg.locator(".card .num").first.inner_text()) == n, "刷新后错题本对不上"

        assert not errs, f"控制台报错：{errs}"
        b.close()
    print("端到端自检通过")


if __name__ == "__main__":
    sys.exit(run())
