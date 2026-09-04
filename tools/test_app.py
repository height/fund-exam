#!/usr/bin/env python3
"""端到端自检：先 npm run build，再真跑一遍要部署的 dist/index.html。

只驱动界面，不碰内部变量，所以重构不会把测试一起带塌。
用法: python3 tools/test_app.py（需要 playwright + 本机 Chrome）
"""
import base64
import json
import re
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
        # 答题进度栏固定在视口顶部，正文滚动时不能跟着离场
        assert pg.eval_on_selector(".topbar", "e=>getComputedStyle(e).position") == "fixed", \
            "答题进度栏不是 fixed"
        top_y = pg.locator(".topbar").bounding_box()["y"]
        pg.evaluate("document.body.style.minHeight='1600px';scrollTo(0,500)")
        pg.wait_for_timeout(80)
        assert abs(pg.locator(".topbar").bounding_box()["y"] - top_y) < 1, \
            "滚动内容时答题进度栏跟着滑走了"
        pg.evaluate("document.body.style.minHeight='';scrollTo(0,0)")
        pg.go_back()
        # 考试模式：同一章抽最多 30 题限时考
        pg.wait_for_selector(".ch-row")
        pg.click('[role="tab"]:has-text("考试")')
        pg.locator(".ch-row").first.click()
        pg.wait_for_selector(".stats")
        assert "章节考试" in pg.locator("h1").first.inner_text()
        pg.goto(APP)
        pg.wait_for_selector(".tile")

        # 公式攻坚：47 组结构化公式 + SVG 字符讲解 + 即时练题
        pg.click('.tile:has-text("公式攻坚")')
        pg.wait_for_selector(".calc-fab")
        assert pg.locator(".formula-groups button").count() == 6, "公式没有按 6 个学习岛分组"
        assert pg.locator(".formula-row").count() == 8, "财务底座应有 8 组公式"
        assert pg.locator(".formula-view img").count() == 0, "公式页不应继续使用扫描截图"
        assert pg.eval_on_selector(".formula-groups", "e=>e.scrollWidth<=e.clientWidth+1"), \
            "公式分组仍需要横向滑动"
        # 搜索跨分组查公式
        pg.fill("#formula-query", "久期")
        assert pg.locator(".formula-row").count() == 1
        assert "债券久期" in pg.locator(".formula-row").inner_text()
        pg.fill("#formula-query", "")
        # 每个公式有可点击 SVG 字符、第一性原理、数字示例和一道题
        pg.locator(".formula-row").first.click()
        pg.wait_for_selector(".formula-workbench")
        assert pg.locator('.formula-svg [role="button"]').count() >= 5, "公式没有拆到字符级"
        pg.locator('.formula-svg [role="button"]').nth(1).click()
        assert "两边表示同一个量" in pg.locator(".formula-callout").inner_text()
        assert pg.locator(".formula-scope-highlight").count() == 0, "等号不应选中整条公式"
        pg.locator('.formula-svg [role="button"]').nth(3).click()
        assert "负债" in pg.locator(".formula-callout").inner_text()
        assert "所有者权益" in pg.locator(".formula-callout").inner_text()
        assert pg.locator(".formula-scope-highlight").count() == 1, "加号没有选中完整计算关系"
        assert pg.eval_on_selector(".formula-svg", "e=>e.scrollWidth<=e.clientWidth+1"), \
            "公式 SVG 出现横向溢出"
        assert pg.locator(".principle-svg").count() == 1
        assert pg.locator(".example-svg").count() == 1
        pg.click('.formula-options button:has-text("50 万")')
        pg.wait_for_selector(".quiz-feedback.right")
        assert "这条会了" in pg.locator(".quiz-feedback").inner_text()
        pg.click('button[aria-label="返回公式总览"]')
        pg.wait_for_selector(".formula-index")
        # 最长的一组公式也必须整体缩放在手机宽度内，不能换行或把横滑当兜底。
        pg.fill("#formula-query", "除权与除息")
        pg.locator(".formula-row").click()
        pg.wait_for_selector(".formula-workbench")
        assert pg.locator('.formula-svg [role="button"]').count() >= 12
        assert pg.locator(".formula-svg .fraction-bar").count() >= 1, "除法没有改成分数线"
        assert pg.eval_on_selector(".formula-svg", "e=>e.scrollWidth<=e.clientWidth+1"), \
            "长公式仍有横向溢出"
        assert pg.evaluate("document.documentElement.scrollWidth<=document.documentElement.clientWidth+1"), \
            "公式学习页整体出现横向滚动"
        pg.click('button[aria-label="返回公式总览"]')
        pg.wait_for_selector(".formula-index")
        # 全量走过 47 组、120 个公式版本，防止只把示例公式排对，复杂公式却解析成空白或 NaN。
        pg.fill("#formula-query", "")
        expected_group_sizes = [8, 6, 9, 9, 6, 9]
        formula_versions = 0
        for group_index, group_size in enumerate(expected_group_sizes):
            pg.locator(".formula-groups button").nth(group_index).click()
            assert pg.locator(".formula-row").count() == group_size
            for row_index in range(group_size):
                pg.locator(".formula-row").nth(row_index).click()
                pg.wait_for_selector(".formula-svg")
                variants = pg.locator(".formula-variants button")
                version_count = variants.count() or 1
                formula_versions += version_count
                for variant_index in range(variants.count()):
                    variants.nth(variant_index).click()
                    view_box = pg.locator(".formula-svg").get_attribute("viewBox") or ""
                    assert "NaN" not in view_box and pg.locator(".formula-svg text").count() > 0
                    assert pg.eval_on_selector(".formula-svg", "e=>e.scrollWidth<=e.clientWidth+1")
                pg.click('button[aria-label="返回公式总览"]')
                pg.wait_for_selector(".formula-index")
        assert formula_versions == 120, f"应检查 120 个公式版本，实际 {formula_versions}"
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
        pg.click('.formula-bar button[aria-label="返回首页"]')
        pg.wait_for_selector(".hero-verdict")

        # 数字必背：题卡先遮答案、翻面显示数字与易混项；模拟练习复用章节考试规格
        pg.click('button:has-text("数字必背")')
        pg.wait_for_selector(".number-card")
        ledger = pg.locator(".number-ledger").inner_text()
        card_n = int(re.search(r"共\s*(\d+)\s*张", ledger).group(1))
        assert card_n > 50, f"科目一数字题卡只有 {card_n} 张，筛选可能漏题"
        assert pg.locator(".number-answer").count() == 0, "题卡初始不该泄露答案"
        assert "%" in pg.locator(".number-lock").inner_text(), "题卡遮住了数字单位"
        pg.click('button:has-text("翻到答案")')
        pg.wait_for_selector(".number-answer")
        assert pg.locator(".number-parts strong").count() >= 1, "翻面后没有突出显示数字"
        assert pg.locator(".number-confuse").count() == 1, "没有显示数字干扰项"
        pg.click('[role="tab"]:has-text("模拟练习")')
        pg.wait_for_selector(".number-exam-all")
        assert pg.locator(".ch-row").count() == 0, "数字模拟练习不应按章节拆分"
        pg.click(".number-exam-all")
        pg.wait_for_selector('h1:has-text("数字模拟练习")')
        assert pg.locator(".stats .stat").first.inner_text().startswith("30"), "数字模拟练习没有按最多 30 题抽题"
        pg.click('button:has-text("返回数字必背")')
        pg.wait_for_selector(".number-exam-all")
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
        assert pg.locator('button[aria-label="朗读答案解析"]').count() == 1, "答案解析没有朗读按钮"

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
            'data: {"choices":[{"delta":{"content":"## 结论\\n考点：**不可分性**\\n**一句话**：拆不开\\n---\\n"}}]}\n\n'
            'data: {"choices":[{"delta":{"content":"## 易错辨析\\n1. 金额大\\n2. 拆不开\\n'
            f'|项目|{wide}|\\n|---|---|\\n|甲|乙|"}}}}]}}\n\n'
            'data: {"choices":[{"delta":{"content":"\\n## 记忆提示\\n> 一整份，拆不开"}}]}\n\n'
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
        assert pg.locator(".md-tone-answer").count() == 1, "结论标题没有语义层级"
        assert pg.locator(".md-tone-risk").count() == 1, "易错标题没有语义层级"
        assert pg.locator(".md-tone-memory").count() == 1, "记忆标题没有语义层级"
        assert pg.locator(".md-note").count() == 1, "Markdown 提示块没渲染"

        # 图解 tab：出沙箱 iframe；三档 tab 来回切不重发请求
        h0 = len(ai_hits)
        pg.click('.explain-tabs button:has-text("图解")')
        pg.wait_for_selector('iframe.demo-frame')
        assert pg.locator('.demo-box .generation-status').count() == 0, \
            "图解完成后仍显示生成状态"
        assert pg.locator("iframe.demo-frame").get_attribute("sandbox") == "allow-scripts", "iframe 没关沙箱"
        diagram_base_hash = pg.evaluate("location.hash")
        pg.click('.demo-box button[aria-label="全屏查看"]')
        pg.wait_for_selector(".demo-full")
        assert "fullscreen=diagram" in pg.evaluate("location.hash"), "图解全屏没有压入 hash 历史"
        assert pg.locator('.demo-full button[aria-label="返回答题页"]').count() == 1, \
            "图解全屏左上角没有返回按钮"
        assert pg.locator('.demo-full button[aria-label="退出全屏"]').count() == 0, \
            "图解全屏仍显示右上角退出按钮"
        assert pg.eval_on_selector(".demo-full", "e=>{const b=e.querySelector('.full-back').getBoundingClientRect(),c=e.querySelector('.demo-frame').getBoundingClientRect();return c.top>=b.bottom}") , \
            "图解内容侵入了顶部返回按钮安全区"
        pg.click('.demo-full button[aria-label="返回答题页"]')
        pg.wait_for_selector(".demo-full", state="detached")
        assert pg.evaluate("location.hash") == diagram_base_hash, "退出图解全屏后没有回到原答题路由"
        assert pg.locator(".stem").count() == 1, "浏览器返回误退出了答题界面"
        # 图解 iframe 内的双击通过 postMessage 切换全屏，不能只在 iframe 外层生效
        pg.frame_locator('.demo-box iframe.demo-frame').locator('body').dispatch_event('dblclick')
        pg.wait_for_selector('.demo-full iframe.demo-frame')
        pg.frame_locator('.demo-full iframe.demo-frame').locator('body').dispatch_event('dblclick')
        pg.wait_for_selector('.demo-full', state='detached')
        assert pg.evaluate("location.hash") == diagram_base_hash, "双击退出图解全屏后 hash 没恢复"
        pg.click('.explain-tabs button:text-is("解析")')
        pg.click('.explain-tabs button:has-text("AI 解析")')
        pg.click('.explain-tabs button:has-text("图解")')
        pg.wait_for_selector('iframe.demo-frame')
        assert len(ai_hits) == h0 + 1, f"切 tab 不该重发请求，多了 {len(ai_hits) - h0 - 1} 次"
        pg.click('.explain-tabs button:has-text("AI 解析")')

        # AI 文字解析同样能全屏
        assert pg.locator('.ai-box .generation-status').count() == 0, \
            "AI 解析完成后小屏仍显示生成状态"
        assert pg.locator('.ai-actions button[aria-label="全屏查看"]').count() == 1, \
            "AI 解析完成后操作栏没有全屏按钮"
        ai_base_hash = pg.evaluate("location.hash")
        pg.click('.ai-box button[aria-label="全屏查看"]')
        pg.wait_for_selector(".ai-full .ai-text b")
        assert "fullscreen=ai" in pg.evaluate("location.hash"), "AI 解析全屏没有压入 hash 历史"
        assert pg.locator('.ai-full .generation-status').count() == 0, \
            "AI 解析完成后全屏仍显示生成状态"
        assert pg.locator('.ai-full .ai-actions button[aria-label="退出全屏"]').count() == 1, \
            "AI 解析全屏操作栏没有退出全屏按钮"
        assert pg.eval_on_selector(".ai-full", "e=>{const b=e.querySelector('.full-back').getBoundingClientRect(),c=e.querySelector('.ai-text').getBoundingClientRect();return c.top>=b.bottom}") , \
            "AI 解析内容侵入了顶部返回按钮安全区"
        pg.dblclick('.ai-full .ai-text')
        pg.wait_for_selector(".ai-full", state="detached")
        assert pg.evaluate("location.hash") == ai_base_hash, "双击退出 AI 全屏后没有回到原答题路由"
        assert pg.locator(".stem").count() == 1, "浏览器返回误退出了答题界面"
        pg.dblclick('.ai-box .ai-text')
        pg.wait_for_selector('.ai-full .ai-text')
        pg.go_back()
        pg.wait_for_selector('.ai-full', state='detached')

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
        assert pg.locator('.bubble button[aria-label="朗读解释"]').count() == 1, \
            "长按解释浮层没有朗读按钮"
        pg.evaluate(select, ".bubble-body p")
        pg.wait_for_selector(".sel-tip")
        pg.click(".sel-tip")
        pg.wait_for_function("document.querySelectorAll('.bubble').length === 2")
        pg.locator('.bubble button[aria-label="关闭"]').last.click()
        pg.wait_for_function("document.querySelectorAll('.bubble').length === 1")
        pg.locator('.bubble button[aria-label="关闭"]').click()

        # 朗读：模拟 MiMo 的 SSE PCM16 分片，不能退回「等完整 WAV 再播」的老链路
        pcm = b"\x00" * (24000 * 2)  # 24kHz mono，1 秒静音；首包单独够起播
        cut = 24000 * 2 * 55 // 100
        chunks = [base64.b64encode(pcm[:cut]).decode(), base64.b64encode(pcm[cut:]).decode()]
        # route.fulfill 会一次性交完整 body，测不出真假流式。这里让浏览器里的
        # ReadableStream 延迟交第二包和 [DONE]，并记录真实请求体供下面断言。
        pg.evaluate("""chunks => {
            const realFetch = window.fetch.bind(window)
            window.__ttsReqs = []
            window.__ttsFinished = false
            window.fetch = (input, init = {}) => {
              if (!String(input).includes('api.xiaomimimo.com')) return realFetch(input, init)
              window.__ttsReqs.push(JSON.parse(init.body))
              window.__ttsFinished = false
              const enc = new TextEncoder()
              const event = data => enc.encode('data: ' + JSON.stringify({
                choices: [{ delta: { audio: { data } } }]
              }) + '\\n\\n')
              let timers = []
              const body = new ReadableStream({
                start(controller) {
                  controller.enqueue(event(chunks[0]))
                  timers.push(setTimeout(() => controller.enqueue(event(chunks[1])), 1200))
                  timers.push(setTimeout(() => {
                    controller.enqueue(enc.encode('data: [DONE]\\n\\n'))
                    window.__ttsFinished = true
                    controller.close()
                  }, 1350))
                },
                cancel() { timers.forEach(clearTimeout) },
              })
              return Promise.resolve(new Response(body, {
                status: 200, headers: { 'Content-Type': 'text/event-stream' }
              }))
            }
        }""", chunks)
        pg.evaluate("""() => {
            const s = JSON.parse(localStorage.getItem('ai-config'))
            s.ttsKey = 'tts-test'
            localStorage.setItem('ai-config', JSON.stringify(s))
        }""")
        pg.click('button[aria-label="朗读题目"]')
        pg.wait_for_selector('button.spk[data-state="playing"]', timeout=1000)
        assert not pg.evaluate("window.__ttsFinished"), "等到完整响应结束才播放，不是真流式"
        # AudioWorklet 在繁忙的无头 Chrome 里收尾会有额外调度延迟；
        # 这里验证最终回到 idle，不把机器性能当成 3 秒产品承诺。
        pg.wait_for_selector('button[aria-label="朗读题目"]', timeout=6000)
        pg.click('button[aria-label="朗读解析"]')
        pg.wait_for_selector('button.spk[data-state="playing"]', timeout=1000)
        assert not pg.evaluate("window.__ttsFinished"), "解析朗读没有在首包到达后起播"
        pg.wait_for_selector('button[aria-label="朗读解析"]', timeout=6000)
        tts_hits = pg.evaluate("window.__ttsReqs")
        assert len(tts_hits) == 2, f"TTS 该被调用两次，实际 {len(tts_hits)}"
        assert all(x["stream"] is True and x["audio"]["format"] == "pcm16" for x in tts_hits), \
            "TTS 没有请求原生 PCM 流"
        assert "语音" not in (pg.locator(".toast").inner_text() or ""), "朗读报错了"
        # 同一段话重播直接用缓存，不该再花钱合成。
        # 第一次点从缓存起播，第二次点把它停掉；两次都不该再请求接口。
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

        # 错题重练：跳过选范围，直接进答题（错题列表本身也有 .stem，等按钮才算真进了练习页）
        pg.click('button:has-text("错题重练")')
        pg.wait_for_selector('button[aria-label="退出练习"]')
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

        # AI 配置：下拉切预设，自动带出地址和模型名
        ai_sel = pg.locator('.card:has(h2:text-is("AI 解析")) select')
        assert ai_sel.locator("option").count() >= 3, "预设少了"
        ai_sel.select_option("glm")
        assert pg.locator(".ai-field input").nth(1).input_value() == "glm-5.3"
        assert "bigmodel.cn" in pg.locator(".ai-field input").nth(0).input_value()
        ai_sel.select_option("zenmux")
        assert pg.locator(".ai-field input").nth(1).input_value() == "deepseek/deepseek-v4-pro"
        assert "zenmux.ai" in pg.locator(".ai-field input").nth(0).input_value()
        ai_sel.select_option("deepseek")
        assert pg.locator(".ai-field input").nth(1).input_value() == "deepseek-v4-pro"

        # 保存前先试调用：通了才落盘（沿用上面注册的假接口），401 则保存失败
        pg.click('button:has-text("保存并测试")')
        pg.wait_for_selector('.toast:has-text("已保存")')
        pg.unroute("**/chat/completions")
        pg.route("**/chat/completions", lambda r: r.fulfill(status=401, body="{}"))
        pg.click('button:has-text("保存并测试")')
        pg.wait_for_selector('.toast:has-text("保存失败：Key 无效")')

        # 下拉选中即默认模型：切到 GLM 后刷新，还停在 GLM；DeepSeek 那份配置也没丢
        # 顺带验证 hash 路由：刷新后还在设置页，不用重新点导航
        pg.locator('.card:has(h2:text-is("AI 解析")) select').select_option("glm")
        pg.reload()
        pg.wait_for_selector('h1:has-text("设置")')
        assert pg.locator('.card:has(h2:text-is("AI 解析")) select').input_value() == "glm", "刷新后默认模型没记住"
        pg.locator('.card:has(h2:text-is("AI 解析")) select').select_option("deepseek")
        assert pg.locator(".ai-field input").nth(2).input_value() == "sk-test", "DeepSeek 的 Key 没记住"
        # 配没配 Key 在下拉里要看得出来
        opts = pg.locator('.card:has(h2:text-is("AI 解析")) select').locator("option").all_inner_texts()
        assert any("DeepSeek" in o and "已配" in o for o in opts), f"已配标记不见了：{opts}"
        assert any("ZenMux" in o and "未配" in o for o in opts), f"未配标记不见了：{opts}"

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

        # 触屏取词：用 CDP 发真实 touchStart/Move/End，不用直接调内部函数的假测试。
        # 新 context 开启 coarse pointer，同时证明桌面那套原生划选没有被修改。
        touch_ctx = b.new_context(viewport={"width": 390, "height": 844},
                                  is_mobile=True, has_touch=True)
        mob = touch_ctx.new_page()
        mob.on("pageerror", lambda e: errs.append(f"触屏页报错：{e}"))
        mob.goto(f"{APP}#/practice")
        mob.wait_for_selector('button:has-text("开始练习")')
        mob.click('button:has-text("开始练习")')
        mob.wait_for_selector(".stem")
        cdp = touch_ctx.new_cdp_session(mob)

        def char_point(selector, index):
            """取指定字符的可视中心，使手势测试不依赖某道题的固定文案。"""
            return mob.eval_on_selector(selector, """(root, wanted) => {
              const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
              let node, seen = 0
              while ((node = w.nextNode())) {
                if (wanted < seen + node.data.length) {
                  const at = Math.max(0, wanted - seen)
                  const r = document.createRange()
                  r.setStart(node, at); r.setEnd(node, Math.min(at + 1, node.data.length))
                  const b = r.getBoundingClientRect()
                  return {x: b.left + Math.max(1, b.width / 2), y: b.top + b.height / 2}
                }
                seen += node.data.length
              }
              throw new Error('指定字符超出文本')
            }""", index)

        def expected_word(selector, index):
            return mob.eval_on_selector(selector, """(root, index) => {
              const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
              let node, text = ''
              while ((node = w.nextNode())) text += node.data
              const segments = [...new Intl.Segmenter('zh-CN',{granularity:'word'}).segment(text)]
              const hit = segments.find(s => index >= s.index && index < s.index + s.segment.length)
              return hit?.isWordLike ? hit.segment : null
            }""", index)

        def touch(kind, point=None, ident=1):
            points = [] if point is None else [{
                "x": round(point["x"]), "y": round(point["y"]),
                "id": ident, "radiusX": 2, "radiusY": 2, "force": 1,
            }]
            cdp.send("Input.dispatchTouchEvent", {"type": kind, "touchPoints": points})

        assert mob.locator("html").get_attribute("data-custom-selection") is not None, \
            "触屏环境没启用自定义取词"
        assert mob.eval_on_selector(".stem", "e=>getComputedStyle(e).userSelect") == "none", \
            "触屏题干仍会触发系统选区"
        assert mob.eval_on_selector(".stem", """e=>{
          const x=new MouseEvent('contextmenu',{bubbles:true,cancelable:true})
          e.dispatchEvent(x); return x.defaultPrevented
        }"""), "触屏长按的 contextmenu 没被拦住"

        # 1) 快速滑动应立刻取消长按计时，不能误出取词 UI。
        p0 = char_point(".stem", 2)
        touch("touchStart", p0)
        touch("touchMove", {"x": p0["x"], "y": p0["y"] - 70})
        touch("touchEnd")
        mob.wait_for_timeout(500)
        assert mob.locator(".sel-tip").count() == 0, "滑动页面时误触了长按取词"
        mob.evaluate("scrollTo(0, 0)")
        mob.wait_for_timeout(50)

        # 2) 按住成立后用 CSS Highlight/遮罩自绘，系统 Selection 必须仍为空。
        p0 = char_point(".stem", 2)
        p1 = char_point(".stem", 14)
        expected_initial = expected_word(".stem", 2)
        touch("touchStart", p0)
        mob.wait_for_selector(".sel-tip", timeout=1000)
        initial_term = mob.locator(".sel-tip").get_attribute("data-term")
        assert initial_term == expected_initial, \
            f"长按没有精确命中触点词：期望 {expected_initial}，实际 {initial_term}"
        assert mob.evaluate("getSelection().isCollapsed"), "自定义取词意外写入了系统 Selection"
        assert mob.locator(".sel-handle").count() == 2, "自定义选区没有双端拖拽手柄"
        assert mob.locator(".sel-marks i").count() >= 1, "自定义选区没有画出高亮"
        handle_alignment = mob.evaluate("""() => {
          const marks=[...document.querySelectorAll('.sel-marks i')]
          const first=marks[0].getBoundingClientRect(), last=marks.at(-1).getBoundingClientRect()
          const center=(selector) => {
            const el=document.querySelector(selector), box=el.getBoundingClientRect()
            const knob=getComputedStyle(el,'::after')
            return box.top+parseFloat(knob.top)+parseFloat(knob.height)/2
          }
          return {top:first.top,bottom:last.bottom,start:center('.sel-handle-start'),
            end:center('.sel-handle-end')}
        }""")
        assert abs(handle_alignment["start"] - handle_alignment["top"]) <= 1, \
            f"起点手柄偏离了选区顶部：{handle_alignment}"
        assert abs(handle_alignment["end"] - handle_alignment["bottom"]) <= 1, \
            f"终点手柄偏离了选区底部：{handle_alignment}"
        painted = mob.eval_on_selector(".sel-marks i", """el => {
          const r=el.getBoundingClientRect(), bg=getComputedStyle(el).backgroundColor
          return r.width>0 && r.height>0 && bg!=='transparent' && !bg.endsWith(', 0)')
        }""")
        assert painted, "自定义选中态不可见"

        # 手指不抬起直接向后拖：以词边界吸附扩选。
        touch("touchMove", p1)
        mob.wait_for_timeout(80)
        touch("touchEnd")
        extended_term = mob.locator(".sel-tip").get_attribute("data-term")
        assert len(extended_term) > len(initial_term), \
            f"长按后直接拖动没扩选：{initial_term} -> {extended_term}"
        assert len(extended_term) <= 60, "拖选超过了 60 字上限"

        # 3) 抬手后仍能分别拖终点扩展、拖起点收窄。
        end_box = mob.locator(".sel-handle-end").bounding_box()
        stem_len = mob.eval_on_selector(".stem", "e=>e.textContent.length")
        p2 = char_point(".stem", min(40, stem_len - 2))
        touch("touchStart", {"x": end_box["x"] + end_box["width"] / 2,
                              "y": end_box["y"] + end_box["height"] / 2}, ident=2)
        touch("touchMove", p2, ident=2)
        mob.wait_for_timeout(80)
        touch("touchEnd", ident=2)
        handle_extended = mob.locator(".sel-tip").get_attribute("data-term")
        assert len(handle_extended) > len(extended_term), \
            f"终点手柄没有扩大选区：{extended_term} -> {handle_extended}"
        assert mob.locator(".sel-tip-copy").text_content() == f'解释 “{handle_extended}”', \
            "解释按钮展示的词与实际选区不一致"
        assert mob.eval_on_selector(".sel-tip-term", "e=>e.scrollWidth>e.clientWidth"), \
            "长词没有在按钮内省略"
        assert mob.eval_on_selector(".sel-tip", "e=>e.getBoundingClientRect().width<=164.5"), \
            "长词把解释按钮撑出了最大宽度"

        start_box = mob.locator(".sel-handle-start").bounding_box()
        p_start = char_point(".stem", 7)
        touch("touchStart", {"x": start_box["x"] + start_box["width"] / 2,
                              "y": start_box["y"] + start_box["height"] / 2}, ident=3)
        touch("touchMove", p_start, ident=3)
        mob.wait_for_timeout(80)
        touch("touchEnd", ident=3)
        narrowed = mob.locator(".sel-tip").get_attribute("data-term")
        assert len(narrowed) < len(handle_extended), "起点手柄没有收窄选区"

        # 拖到视口底边要逐帧自动滚动，长题不用反复抬手。
        mob.evaluate("document.body.style.minHeight='1400px';scrollTo(0,0)")
        mob.wait_for_timeout(50)
        end_box = mob.locator(".sel-handle-end").bounding_box()
        before_scroll = mob.evaluate("scrollY")
        touch("touchStart", {"x": end_box["x"] + end_box["width"] / 2,
                              "y": end_box["y"] + end_box["height"] / 2}, ident=5)
        touch("touchMove", {"x": 250, "y": 838}, ident=5)
        mob.wait_for_timeout(350)
        touch("touchEnd", ident=5)
        assert mob.evaluate("scrollY") > before_scroll, "选区手柄拖到底边时没有自动滚动"
        narrowed = mob.locator(".sel-tip").get_attribute("data-term")
        assert len(narrowed) <= 60, "边缘滚动扩选超过了 60 字上限"
        mob.evaluate("document.body.style.minHeight='';scrollTo(0,0)")
        mob.wait_for_timeout(50)

        # 4) 解释按钮沿用现有气泡，打开后手柄、高亮、工具条全部收掉。
        mob.locator(".sel-tip").tap()
        mob.wait_for_selector(".bubble")
        assert mob.locator(".bubble-term").inner_text() == narrowed
        assert mob.locator(".sel-tip,.sel-handle").count() == 0, \
            "打开解释后自定义选区没清理"
        mob.click('.bubble button[aria-label="关闭"]')
        mob.wait_for_selector(".bubble", state="detached")

        # 5) 选项文字也能取词，但长按抬手绝不能顺手把选项答了。
        opt_point = char_point(".opt>span", 2)
        touch("touchStart", opt_point, ident=4)
        mob.wait_for_selector(".sel-tip", timeout=1000)
        touch("touchEnd", ident=4)
        assert mob.locator(".explain").count() == 0, "长按选项文字误触了答题 click"
        assert mob.locator(".opt.sel,.opt.ok,.opt.bad").count() == 0, "长按后选项状态被改变"

        # 6) 路由切换清理持有 DOM Range 的 UI，不把旧页节点留在内存里。
        mob.evaluate("location.hash='#/home'")
        mob.wait_for_selector(".hero-verdict")
        assert mob.locator(".sel-tip,.sel-handle,.sel-marks").count() == 0, \
            "切页后还留着上一页的选区"
        assert mob.eval_on_selector("#app", "e=>getComputedStyle(e).userSelect") == "none", \
            "触屏首页仍会调起系统选词"
        # 即使某个 WebView 忽略 CSS，selectionchange 兜底也要立即清掉原生选区。
        mob.evaluate("""() => {
          const el=document.querySelector('.hero-verdict'), r=document.createRange()
          r.selectNodeContents(el); const s=getSelection(); s.removeAllRanges(); s.addRange(r)
        }""")
        mob.wait_for_timeout(350)
        assert mob.evaluate("getSelection().isCollapsed"), "触屏端没有兜底清理系统 Selection"
        # 截图里实际长按的就是这块：首页普通文字也必须走自定义取词。
        home_point = char_point(".today>span", 2)
        touch("touchStart", home_point, ident=6)
        mob.wait_for_selector(".sel-tip", timeout=1000)
        assert mob.locator(".sel-tip").get_attribute("data-term"), "首页普通文字长按没反应"
        assert mob.evaluate("getSelection().isCollapsed"), "首页取词退回了系统 Selection"
        touch("touchEnd", ident=6)
        touch_ctx.close()

        assert not errs, f"控制台报错：{errs}"
        b.close()
    print("端到端自检通过")


if __name__ == "__main__":
    sys.exit(run())
